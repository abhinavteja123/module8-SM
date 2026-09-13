import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { supabase, unwrap } from '../db/client.js';
import { requireAuth, requirePlatformAdmin } from '../middleware/auth.js';
import { createPortalUser } from '../lib/users.js';

const router = Router();

router.get('/universities', requireAuth, requirePlatformAdmin, async (req, res) => {
  const [universities, superadmins, archiveEvents] = await Promise.all([
    supabase.from('universities').select('id,name,code,is_active,created_at').order('name'),
    supabase.from('users').select('id,university_id,full_name,email,is_active,last_login_at,user_roles!inner(role)')
      .eq('user_roles.role', 'crcs_superadmin').order('full_name'),
    supabase.from('audit_log').select('entity_id').eq('action', 'archive_university').eq('entity_type', 'universities'),
  ]);
  const people = unwrap(superadmins);
  const archivedUniversityIds = new Set(unwrap(archiveEvents).map((event) => event.entity_id));
  const superadminsByUniversity = Object.groupBy(people, (person) => person.university_id);
  res.json(unwrap(universities).filter((university) => !archivedUniversityIds.has(university.id)).map((university) => ({
    ...university,
    superadmins: (superadminsByUniversity[university.id] ?? []).map(({ id, full_name, email, is_active, last_login_at }) => ({ id, full_name, email, is_active, must_change_password: last_login_at === null })),
  })));
});

const universityIdSchema = z.string().uuid();

const universityDetailsSchema = z.object({
  university_name: z.string().trim().min(1).max(160),
  university_code: z.string().trim().min(1).max(32),
});

const activeSchema = z.object({ is_active: z.boolean() });
const superadminDetailsSchema = z.object({
  full_name: z.string().trim().min(1).max(160),
  email: z.string().trim().toLowerCase().email(),
});
const superadminPasswordSchema = z.object({ password: z.string().min(8).max(256) });

async function findUniversity(universityId) {
  const [universityResult, archiveResult] = await Promise.all([
    supabase.from('universities').select('id,name,code,is_active,created_at').eq('id', universityId).maybeSingle(),
    supabase.from('audit_log').select('id').eq('action', 'archive_university').eq('entity_type', 'universities').eq('entity_id', universityId).maybeSingle(),
  ]);
  return unwrap(archiveResult) ? null : unwrap(universityResult);
}

async function findUniversitySuperadmin(universityId, personId) {
  return unwrap(await supabase.from('users')
    .select('id,university_id,full_name,email,is_active,user_roles!inner(role)')
    .eq('id', personId).eq('university_id', universityId).eq('user_roles.role', 'crcs_superadmin').maybeSingle());
}

const createUniversitySchema = z.object({
  university_name: z.string().trim().min(1),
  university_code: z.string().trim().min(1),
  admin_email: z.string().trim().toLowerCase().email(),
  admin_password: z.string().min(8),
  admin_full_name: z.string().trim().min(1),
});

router.post('/universities', requireAuth, requirePlatformAdmin, async (req, res) => {
  const parsed = createUniversitySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { university_name, university_code, admin_email, admin_password, admin_full_name } = parsed.data;
  const [university] = unwrap(await supabase.from('universities').insert({ name: university_name, code: university_code }).select());
  try {
    const admin = await createPortalUser({
      email: admin_email, password: admin_password, full_name: admin_full_name,
      roles: [{ role: 'crcs_superadmin' }], university_id: university.id,
    });
    res.status(201).json({ university, admin: { id: admin.id, email: admin.email, full_name: admin.full_name } });
  } catch (error) {
    await supabase.from('universities').delete().eq('id', university.id);
    throw error;
  }
});

// These details intentionally exclude the initial Superadmin: editing a tenant
// must not silently alter an account credential or role. Those are managed in
// the tenant's own Organisation & Users workspace.
router.patch('/universities/:universityId', requireAuth, requirePlatformAdmin, async (req, res) => {
  const universityId = universityIdSchema.safeParse(req.params.universityId);
  if (!universityId.success) return res.status(400).json({ error: universityId.error.flatten() });
  const parsed = universityDetailsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!(await findUniversity(universityId.data))) return res.status(404).json({ error: 'university not found' });
  const [university] = unwrap(await supabase.from('universities').update({
    name: parsed.data.university_name,
    code: parsed.data.university_code.toUpperCase(),
  }).eq('id', universityId.data).select('id,name,code,is_active,created_at'));
  res.json(university);
});

router.patch('/universities/:universityId/active', requireAuth, requirePlatformAdmin, async (req, res) => {
  const universityId = universityIdSchema.safeParse(req.params.universityId);
  if (!universityId.success) return res.status(400).json({ error: universityId.error.flatten() });
  const parsed = activeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!(await findUniversity(universityId.data))) return res.status(404).json({ error: 'university not found' });
  const [university] = unwrap(await supabase.from('universities').update({ is_active: parsed.data.is_active })
    .eq('id', universityId.data).select('id,name,code,is_active,created_at'));
  res.json(university);
});

// A platform administrator may maintain the tenant administrator's contact
// details, but cannot change their CRCS role from this cross-tenant screen.
router.patch('/universities/:universityId/superadmins/:personId', requireAuth, requirePlatformAdmin, async (req, res) => {
  const universityId = universityIdSchema.safeParse(req.params.universityId);
  const personId = universityIdSchema.safeParse(req.params.personId);
  if (!universityId.success || !personId.success) return res.status(400).json({ error: 'invalid university or Superadmin id' });
  const parsed = superadminDetailsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const person = await findUniversitySuperadmin(universityId.data, personId.data);
  if (!person) return res.status(404).json({ error: 'Superadmin not found for this university' });
  const duplicate = unwrap(await supabase.from('users').select('id').eq('email', parsed.data.email).neq('id', person.id).maybeSingle());
  if (duplicate) return res.status(409).json({ error: 'another portal account already uses this email address' });
  const [updated] = unwrap(await supabase.from('users').update({
    full_name: parsed.data.full_name,
    email: parsed.data.email,
    updated_at: new Date().toISOString(),
  }).eq('id', person.id).select('id,full_name,email,is_active,last_login_at'));
  res.json({ ...updated, must_change_password: updated.last_login_at === null });
});

// This never reveals the old password. The recipient receives a new temporary
// password and must replace it themselves before using the tenant workspace.
router.patch('/universities/:universityId/superadmins/:personId/password', requireAuth, requirePlatformAdmin, async (req, res) => {
  const universityId = universityIdSchema.safeParse(req.params.universityId);
  const personId = universityIdSchema.safeParse(req.params.personId);
  if (!universityId.success || !personId.success) return res.status(400).json({ error: 'invalid university or Superadmin id' });
  const parsed = superadminPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const person = await findUniversitySuperadmin(universityId.data, personId.data);
  if (!person) return res.status(404).json({ error: 'Superadmin not found for this university' });
  unwrap(await supabase.from('users').update({
    password_hash: await bcrypt.hash(parsed.data.password, 10),
    last_login_at: null,
    updated_at: new Date().toISOString(),
  }).eq('id', person.id));
  res.json({ id: person.id, must_change_password: true });
});

// Delete is available only after deactivation. Its audit record removes the
// tenant from the platform list while preserving all connected data for
// integrity and recovery.
router.delete('/universities/:universityId', requireAuth, requirePlatformAdmin, async (req, res) => {
  const universityId = universityIdSchema.safeParse(req.params.universityId);
  if (!universityId.success) return res.status(400).json({ error: universityId.error.flatten() });
  const university = await findUniversity(universityId.data);
  if (!university) return res.status(404).json({ error: 'university not found' });
  if (university.is_active) return res.status(409).json({ error: 'Deactivate this university before deleting it.' });
  unwrap(await supabase.from('audit_log').insert({
    actor_id: req.user.id,
    actor_role: null,
    action: 'archive_university',
    entity_type: 'universities',
    entity_id: university.id,
    old_value: { is_active: false },
    new_value: { archived: true, archive_reason: 'platform_admin_delete_after_deactivation' },
  }));
  res.status(204).end();
});

export default router;
