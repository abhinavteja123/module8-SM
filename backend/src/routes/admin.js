import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { supabase, unwrap } from '../db/client.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';
import { createPortalUser, replacePortalUserRoles } from '../lib/users.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// ponytail: hand-rolled CSV split, no embedded-comma/quote support — fine for a plain
// email,password,full_name,... export. Swap for a real CSV lib (or `xlsx` for native
// .xlsx binaries) if onboarding sheets start containing commas in names/values.
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  if (!lines.length) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(',').map((c) => c.trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    return row;
  });
}

function parsePeopleUpload(file) {
  if (/\.xlsx$/i.test(file.originalname) || file.mimetype.includes('spreadsheetml')) {
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) return [];
    return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false }).map((row) => Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key.trim(), String(value).trim()])
    ));
  }
  return parseCsv(file.buffer.toString('utf8'));
}

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().min(1),
  phone: z.string().optional(),
  mentorship_scope: z.enum(['research', 'crcs_self']).optional(),
  roles: z.array(z.object({
    role: z.enum(['student', 'faculty', 'faculty_coordinator', 'hod', 'crcs_coordinator', 'crcs_superadmin', 'dean', 'school_office']),
    department_id: z.string().uuid().optional(),
    school_id: z.string().uuid().optional(),
  })).min(1),
});

router.post('/users', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email, password, full_name, phone, roles, mentorship_scope } = parsed.data;
  const user = await createPortalUser({ email, password, full_name, phone, roles, mentorship_scope });

  await logAudit({
    actorId: req.user.id, actorRole: 'crcs_superadmin', action: 'create_user',
    entityType: 'users', entityId: user.id, newValue: { email, full_name, roles },
  });
  res.status(201).json({ id: user.id, email, full_name, roles });
});

router.get('/users', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const users = unwrap(await supabase.from('users').select('id,email,full_name,phone,is_active,created_at').order('full_name'));
  const roles = users.length ? unwrap(await supabase.from('user_roles').select('user_id,role,department_id,school_id').in('user_id', users.map((user) => user.id))) : [];
  const rolesByUser = Object.groupBy(roles, (role) => role.user_id);
  res.json(users.map((user) => ({ ...user, roles: rolesByUser[user.id] ?? [] })));
});

router.post('/users/bulk', requireAuth, requireRole('crcs_superadmin'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'missing file (field name "file")' });
  const rows = parsePeopleUpload(req.file);
  const results = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // +1 for header, +1 for 1-index
    try {
      if (!row.email || !row.password || !row.full_name || !row.role) {
        throw new Error('missing required column (email/password/full_name/role)');
      }
      let department_id = null;
      let school_id = null;
      if (row.department_code) {
        const d = unwrap(await supabase.from('departments').select('id').eq('code', row.department_code).maybeSingle());
        if (!d) throw new Error(`unknown department_code "${row.department_code}"`);
        department_id = d.id;
      }
      if (row.school_code) {
        const s = unwrap(await supabase.from('schools').select('id').eq('code', row.school_code).maybeSingle());
        if (!s) throw new Error(`unknown school_code "${row.school_code}"`);
        school_id = s.id;
      }

      await createPortalUser({
        email: row.email, password: row.password, full_name: row.full_name, phone: row.phone || null,
        roles: [{ role: row.role, department_id, school_id }], mentorship_scope: row.mentorship_scope || 'research',
        roll_number: row.roll_number || null, batch_year: row.batch_year ? Number(row.batch_year) : null,
      });

      results.push({ row: rowNum, email: row.email, ok: true });
    } catch (err) {
      results.push({ row: rowNum, email: row.email || '(missing)', ok: false, error: err.message });
    }
  }

  await logAudit({
    actorId: req.user.id, actorRole: 'crcs_superadmin', action: 'bulk_create_users',
    entityType: 'users', entityId: req.user.id,
    newValue: { total: rows.length, created: results.filter((r) => r.ok).length },
  });
  res.status(207).json({ results });
});

const rolesSchema = z.object({
  roles: z.array(z.object({
    role: z.enum(['student', 'faculty', 'faculty_coordinator', 'hod', 'crcs_coordinator', 'crcs_superadmin', 'dean', 'school_office']),
    department_id: z.string().uuid().optional(),
    school_id: z.string().uuid().optional(),
  })),
});

router.patch('/users/:id/roles', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const parsed = rolesSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { id } = req.params;
  const result = await replacePortalUserRoles(id, parsed.data.roles);
  res.json({ id, roles: result });
});

const profileSchema = z.object({
  full_name: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'provide at least one field to update' });

router.patch('/users/:id', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const target = unwrap(await supabase.from('users').select('id').eq('id', req.params.id).maybeSingle());
  if (!target) return res.status(404).json({ error: 'user not found' });
  const [updated] = unwrap(await supabase.from('users').update({ ...parsed.data, updated_at: new Date().toISOString() }).eq('id', target.id).select('id,email,full_name,phone,is_active'));
  await logAudit({ actorId: req.user.id, actorRole: 'crcs_superadmin', action: 'edit_user_profile', entityType: 'users', entityId: target.id, newValue: parsed.data });
  res.json(updated);
});

router.get('/users/:id/dependencies', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const target = unwrap(await supabase.from('users').select('id,email,full_name,is_active').eq('id', req.params.id).maybeSingle());
  if (!target) return res.status(404).json({ error: 'user not found' });
  const [roles, mentorAssignments, coordinatorAssignments] = await Promise.all([
    supabase.from('user_roles').select('role,department_id').eq('user_id', target.id),
    supabase.from('mentor_assignments').select('id,student_id,research_application_id').eq('faculty_id', target.id).eq('is_current', true),
    supabase.from('faculty_coordinator_assignments').select('id,faculty_id,department_id').eq('coordinator_id', target.id),
  ]);
  const roleRows = unwrap(roles);
  const mentorRows = unwrap(mentorAssignments);
  const coordinatorRows = unwrap(coordinatorAssignments);
  const needsMentorReplacement = mentorRows.length > 0;
  const needsCoordinatorReplacement = coordinatorRows.length > 0;
  const departmentIds = [...new Set([...roleRows.map((role) => role.department_id), ...coordinatorRows.map((assignment) => assignment.department_id)].filter(Boolean))];
  const candidateRoles = unwrap(await supabase.from('user_roles').select('user_id,role,department_id').in('role', ['faculty', 'faculty_coordinator']).in('department_id', departmentIds.length ? departmentIds : ['00000000-0000-0000-0000-000000000000']));
  const candidateIds = [...new Set(candidateRoles.map((role) => role.user_id).filter((id) => id !== target.id))];
  const candidates = candidateIds.length ? unwrap(await supabase.from('users').select('id,full_name,email').in('id', candidateIds).eq('is_active', true)) : [];
  res.json({ target, active_mentees: mentorRows.length, managed_faculty: coordinatorRows.length, requires_replacement: needsMentorReplacement || needsCoordinatorReplacement, replacement_candidates: candidates });
});

const removeSchema = z.object({ replacement_user_id: z.string().uuid().optional() });

router.post('/users/:id/remove', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const parsed = removeSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const target = unwrap(await supabase.from('users').select('id,email,full_name,is_active').eq('id', req.params.id).maybeSingle());
  if (!target) return res.status(404).json({ error: 'user not found' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'you cannot remove your own Superadmin access' });
  const targetRoles = unwrap(await supabase.from('user_roles').select('role,department_id').eq('user_id', target.id));
  if (targetRoles.some((role) => role.role === 'crcs_superadmin')) {
    const admins = unwrap(await supabase.from('user_roles').select('user_id').eq('role', 'crcs_superadmin'));
    if (admins.length <= 1) return res.status(409).json({ error: 'create another CRCS Superadmin before removing the last one' });
  }
  const mentorAssignments = unwrap(await supabase.from('mentor_assignments').select('*').eq('faculty_id', target.id).eq('is_current', true));
  const coordinatorAssignments = unwrap(await supabase.from('faculty_coordinator_assignments').select('*').eq('coordinator_id', target.id));
  if ((mentorAssignments.length || coordinatorAssignments.length) && !parsed.data.replacement_user_id) {
    return res.status(409).json({ error: 'select a replacement before removing this person', active_mentees: mentorAssignments.length, managed_faculty: coordinatorAssignments.length });
  }
  const replacementId = parsed.data.replacement_user_id;
  if (replacementId) {
    if (replacementId === target.id) return res.status(400).json({ error: 'replacement must be a different person' });
    const replacement = unwrap(await supabase.from('users').select('id,is_active').eq('id', replacementId).maybeSingle());
    if (!replacement?.is_active) return res.status(400).json({ error: 'replacement account must be active' });
    const replacementRoles = unwrap(await supabase.from('user_roles').select('role,department_id').eq('user_id', replacementId));
    if (mentorAssignments.length && !replacementRoles.some((role) => ['faculty', 'faculty_coordinator'].includes(role.role))) return res.status(400).json({ error: 'replacement must be a Faculty Mentor or Faculty Coordinator' });
    if (coordinatorAssignments.length && !replacementRoles.some((role) => role.role === 'faculty_coordinator')) return res.status(400).json({ error: 'replacement must be a Faculty Coordinator' });
    const now = new Date().toISOString();
    for (const assignment of mentorAssignments) {
      unwrap(await supabase.from('mentor_assignments').update({ is_current: false, ended_at: now }).eq('id', assignment.id));
      unwrap(await supabase.from('mentor_assignments').insert({ student_id: assignment.student_id, research_application_id: assignment.research_application_id, faculty_id: replacementId, is_current: true, reassigned_from: assignment.id, reassigned_by: req.user.id, reassignment_reason: 'Mentor removed from the portal.' }));
    }
    for (const assignment of coordinatorAssignments) {
      const duplicate = unwrap(await supabase.from('faculty_coordinator_assignments').select('id').eq('coordinator_id', replacementId).eq('faculty_id', assignment.faculty_id).maybeSingle());
      if (duplicate) unwrap(await supabase.from('faculty_coordinator_assignments').delete().eq('id', assignment.id));
      else unwrap(await supabase.from('faculty_coordinator_assignments').update({ coordinator_id: replacementId }).eq('id', assignment.id));
    }
  }
  unwrap(await supabase.from('users').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', target.id));
  await logAudit({ actorId: req.user.id, actorRole: 'crcs_superadmin', action: 'remove_user_access', entityType: 'users', entityId: target.id, newValue: { replacement_user_id: replacementId ?? null, reassigned_mentees: mentorAssignments.length, reassigned_faculty: coordinatorAssignments.length } });
  res.json({ message: `${target.full_name} has been removed from portal access.`, reassigned_mentees: mentorAssignments.length, reassigned_faculty: coordinatorAssignments.length });
});

router.get('/preferences', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const cycle = unwrap(await supabase.from('internship_cycles').select('id,name,status,preference_changes_locked').eq('status', 'open').order('preference_window_opens_at', { ascending: false }).limit(1).maybeSingle());
  if (!cycle) return res.json({ cycle: null, requests: [] });
  const requests = unwrap(await supabase.from('student_preference_change_requests').select('*').eq('cycle_id', cycle.id).eq('status', 'pending').order('created_at'));
  const studentIds = [...new Set(requests.map((request) => request.student_id))];
  const students = studentIds.length ? unwrap(await supabase.from('users').select('id,full_name,email').in('id', studentIds)) : [];
  const studentsById = Object.fromEntries(students.map((student) => [student.id, student]));
  res.json({ cycle, requests: requests.map((request) => ({ ...request, student: studentsById[request.student_id] ?? null })) });
});

const preferenceLockSchema = z.object({ locked: z.boolean() });

router.patch('/cycles/:id/preference-lock', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const parsed = preferenceLockSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [cycle] = unwrap(await supabase.from('internship_cycles').update({ preference_changes_locked: parsed.data.locked }).eq('id', req.params.id).select('id,name,preference_changes_locked'));
  if (!cycle) return res.status(404).json({ error: 'internship cycle not found' });
  await logAudit({ actorId: req.user.id, actorRole: 'crcs_superadmin', action: parsed.data.locked ? 'lock_track_preferences' : 'unlock_track_preferences', entityType: 'internship_cycles', entityId: cycle.id, newValue: { preference_changes_locked: cycle.preference_changes_locked } });
  res.json(cycle);
});

const preferenceRequestDecisionSchema = z.object({ decision: z.enum(['approve', 'reject']) });

router.patch('/preference-change-requests/:id', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const parsed = preferenceRequestDecisionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const request = unwrap(await supabase.from('student_preference_change_requests').select('*').eq('id', req.params.id).maybeSingle());
  if (!request) return res.status(404).json({ error: 'preference-change request not found' });
  if (request.status !== 'pending') return res.status(409).json({ error: 'this request has already been decided' });
  const now = new Date().toISOString();
  if (parsed.data.decision === 'approve') {
    unwrap(await supabase.from('student_track_selections').delete().eq('student_id', request.student_id).eq('cycle_id', request.cycle_id));
    unwrap(await supabase.from('student_track_selections').insert({ student_id: request.student_id, cycle_id: request.cycle_id, track: request.requested_track }));
  }
  const [updated] = unwrap(await supabase.from('student_preference_change_requests').update({ status: parsed.data.decision === 'approve' ? 'approved' : 'rejected', reviewed_by: req.user.id, reviewed_at: now }).eq('id', request.id).select());
  await logAudit({ actorId: req.user.id, actorRole: 'crcs_superadmin', action: parsed.data.decision === 'approve' ? 'approve_track_change' : 'reject_track_change', entityType: 'student_preference_change_requests', entityId: request.id, oldValue: { current_track: request.current_track }, newValue: { requested_track: request.requested_track, status: updated.status } });
  res.json(updated);
});

const permissionsSchema = z.object({
  permissions: z.array(z.object({ permission_key: z.string(), granted: z.boolean() })),
});

router.get('/crcs-coordinator-permissions/me', requireAuth, requireRole('crcs_coordinator', 'crcs_superadmin'), async (req, res) => {
  const rows = req.user.roles.some((role) => role.role === 'crcs_superadmin')
    ? []
    : unwrap(await supabase.from('crcs_coordinator_permissions').select('permission_key,granted').eq('coordinator_id', req.user.id));
  res.json({ permissions: Object.fromEntries(rows.map((row) => [row.permission_key, row.granted])) });
});

router.put('/admin/crcs-coordinator-permissions/:user_id', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const parsed = permissionsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { user_id } = req.params;
  for (const p of parsed.data.permissions) {
    unwrap(await supabase.from('crcs_coordinator_permissions').upsert(
      { coordinator_id: user_id, permission_key: p.permission_key, granted: p.granted, granted_by: req.user.id, updated_at: new Date().toISOString() },
      { onConflict: 'coordinator_id,permission_key' }
    ));
  }
  await logAudit({
    actorId: req.user.id, actorRole: 'crcs_superadmin', action: 'update_crcs_coordinator_permissions',
    entityType: 'crcs_coordinator_permissions', entityId: user_id, newValue: parsed.data.permissions,
  });
  res.json({ user_id, permissions: parsed.data.permissions });
});

router.get('/audit-log', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const { entity_type, entity_id } = req.query;
  let query = supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(200);
  if (entity_type) query = query.eq('entity_type', entity_type);
  if (entity_id) query = query.eq('entity_id', entity_id);
  res.json(unwrap(await query));
});

export default router;
