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
  roles: z.array(z.object({
    role: z.enum(['student', 'faculty', 'faculty_coordinator', 'hod', 'crcs_coordinator', 'crcs_superadmin', 'dean', 'school_office']),
    department_id: z.string().uuid().optional(),
    school_id: z.string().uuid().optional(),
  })).min(1),
});

// No public signup — only CRCS Superadmin creates accounts (§8).
router.post('/register', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email, password, full_name, phone, roles } = parsed.data;
  const user = await createPortalUser({ email, password, full_name, phone, roles });
  res.status(201).json({ id: user.id, email, full_name, roles });
});

const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string() });

const quickLoginRoleLabels = {
  crcs_superadmin: ['Administration and oversight', 'CRCS Superadmin'],
  crcs_coordinator: ['Administration and oversight', 'CRCS Coordinator'],
  dean: ['Administration and oversight', 'Dean'],
  hod: ['Administration and oversight', 'HOD'],
  school_office: ['Administration and oversight', 'School Office'],
  faculty_coordinator: ['Administration and oversight', 'Faculty Coordinator'],
  faculty: ['Faculty mentors', 'Faculty Mentor'],
  student: ['Students', 'Student'],
};

// This route exists only for local test switching. Its explicit opt-in avoids
// exposing credentials in ordinary or production deployments.
router.get('/testing-accounts', async (_req, res) => {
  if (process.env.TEST_QUICK_LOGINS !== 'true') return res.status(404).json({ error: 'not found' });
  const [users, assignments] = await Promise.all([
    supabase.from('users').select('id,full_name,email').eq('is_active', true).order('full_name'),
    supabase.from('user_roles').select('user_id,role'),
  ]);
  const rolesByUser = unwrap(assignments).reduce((roles, assignment) => {
    (roles[assignment.user_id] ??= []).push(assignment.role);
    return roles;
  }, {});
  const priority = ['crcs_superadmin', 'crcs_coordinator', 'dean', 'hod', 'school_office', 'faculty_coordinator', 'faculty', 'student'];
  const seenEmails = new Set();
  const uniqueUsers = unwrap(users).filter((user) => {
    const normalizedEmail = user.email.trim().toLowerCase();
    if (seenEmails.has(normalizedEmail)) return false;
    seenEmails.add(normalizedEmail);
    return true;
  });
  res.json(uniqueUsers.map((user) => {
    const role = priority.find((candidate) => rolesByUser[user.id]?.includes(candidate));
    const [group, label] = quickLoginRoleLabels[role] ?? ['Other test accounts', role ?? 'Account'];
    return { name: user.full_name.trim(), email: user.email, password: user.full_name.trim(), role: label, group };
  }));
});

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email, password } = parsed.data;

  const { data: dbUser, error } = await supabase.from('users').select('*').eq('email', email).eq('is_active', true).maybeSingle();
  if (error) throw new Error(error.message);
  if (!dbUser) return res.status(401).json({ error: 'invalid credentials' });
  const ok = await bcrypt.compare(password, dbUser.password_hash);
  if (!ok) return res.status(401).json({ error: 'invalid credentials' });

  const roles = await loadRoles(dbUser.id);
  const user = { id: dbUser.id, roles };
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  res.json({
    accessToken,
    refreshToken,
    user: { id: dbUser.id, email: dbUser.email, full_name: dbUser.full_name, roles },
  });
});

router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body ?? {};
  if (!refreshToken) return res.status(400).json({ error: 'missing refreshToken' });
  try {
    const payload = verifyRefreshToken(refreshToken);
    const roles = await loadRoles(payload.sub);
    const accessToken = signAccessToken({ id: payload.sub, roles });
    res.json({ accessToken });
  } catch {
    res.status(401).json({ error: 'invalid or expired refresh token' });
  }
});

// Stateless JWT — logout is client-side token discard. No server session to invalidate.
router.post('/logout', (req, res) => res.status(204).end());

export default router;
