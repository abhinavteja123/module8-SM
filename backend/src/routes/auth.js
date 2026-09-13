import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { supabase, unwrap } from '../db/client.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/jwt.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { createPortalUser } from '../lib/users.js';

const router = Router();

async function loadRoles(userId) {
  return unwrap(await supabase.from('user_roles').select('role, department_id, school_id').eq('user_id', userId));
}

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8),
  full_name: z.string().min(1),
  phone: z.string().optional(),
  cgpa: z.coerce.number().min(0).max(10).optional(),
  roles: z.array(z.object({
    role: z.enum(['student', 'faculty', 'faculty_coordinator', 'hod', 'crcs_coordinator', 'crcs_superadmin', 'dean', 'school_office']),
    department_id: z.string().uuid().optional(),
    school_id: z.string().uuid().optional(),
  })).min(1),
}).superRefine((value, ctx) => {
  if (value.roles.some((role) => role.role === 'student') && value.cgpa === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cgpa'], message: 'student CGPA is required' });
  }
});

// No public signup — only CRCS Superadmin creates accounts (§8).
router.post('/register', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email, password, full_name, phone, cgpa, roles } = parsed.data;
  const user = await createPortalUser({ email, password, full_name, phone, cgpa, roles, university_id: req.user.university_id });
  res.status(201).json({ id: user.id, email, full_name, roles });
});

const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string() });

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email, password } = parsed.data;

  const { data: dbUser, error } = await supabase.from('users').select('*').eq('email', email).eq('is_active', true).maybeSingle();
  if (error) throw new Error(error.message);
  if (!dbUser) return res.status(401).json({ error: 'invalid credentials' });
  const ok = await bcrypt.compare(password, dbUser.password_hash);
  if (!ok) return res.status(401).json({ error: 'invalid credentials' });
  if (dbUser.university_id) {
    const university = unwrap(await supabase.from('universities').select('is_active').eq('id', dbUser.university_id).maybeSingle());
    if (!university?.is_active) return res.status(403).json({ error: 'university access is deactivated' });
  }

  // New accounts keep this null until the temporary password is changed. That
  // state is both the first-login gate and the server-side enforcement marker.
  if (dbUser.last_login_at) {
    supabase.from('users').update({ last_login_at: new Date().toISOString() }).eq('id', dbUser.id)
      .then(({ error: updateError }) => { if (updateError) console.error('last_login_at update failed', updateError); });
  }

  const roles = dbUser.is_platform_admin ? [] : await loadRoles(dbUser.id);
  const user = { id: dbUser.id, roles, university_id: dbUser.university_id, isPlatformAdmin: dbUser.is_platform_admin };
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  res.json({
    accessToken,
    refreshToken,
    user: { id: dbUser.id, email: dbUser.email, full_name: dbUser.full_name, roles, isPlatformAdmin: dbUser.is_platform_admin, must_change_password: !dbUser.last_login_at },
  });
});

const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8),
});

router.post('/change-password', requireAuth, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const user = unwrap(await supabase.from('users').select('id,email,full_name,password_hash,is_platform_admin').eq('id', req.user.id).eq('is_active', true).maybeSingle());
  if (!user) return res.status(404).json({ error: 'account not found' });
  if (!(await bcrypt.compare(parsed.data.current_password, user.password_hash))) return res.status(401).json({ error: 'current password is incorrect' });
  if (await bcrypt.compare(parsed.data.new_password, user.password_hash)) return res.status(400).json({ error: 'new password must be different from the current password' });
  unwrap(await supabase.from('users').update({ password_hash: await bcrypt.hash(parsed.data.new_password, 10), last_login_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', user.id));
  res.json({ user: { id: user.id, email: user.email, full_name: user.full_name, roles: req.user.roles, isPlatformAdmin: user.is_platform_admin, must_change_password: false } });
});

router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body ?? {};
  if (!refreshToken) return res.status(400).json({ error: 'missing refreshToken' });
  try {
    const payload = verifyRefreshToken(refreshToken);
    const { data: activeUser, error } = await supabase.from('users').select('id,university_id,is_platform_admin').eq('id', payload.sub).eq('is_active', true).maybeSingle();
    if (error || !activeUser) return res.status(401).json({ error: 'invalid refresh token' });
    if (activeUser.university_id) {
      const university = unwrap(await supabase.from('universities').select('is_active').eq('id', activeUser.university_id).maybeSingle());
      if (!university?.is_active) return res.status(401).json({ error: 'university access is deactivated' });
    }
    const roles = await loadRoles(payload.sub);
    const accessToken = signAccessToken({ id: payload.sub, roles, university_id: activeUser.university_id, isPlatformAdmin: activeUser.is_platform_admin });
    res.json({ accessToken });
  } catch {
    res.status(401).json({ error: 'invalid or expired refresh token' });
  }
});

// Stateless JWT — logout is client-side token discard. No server session to invalidate.
router.post('/logout', (req, res) => res.status(204).end());

export default router;
