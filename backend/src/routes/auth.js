import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { supabase, unwrap } from '../db/client.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/jwt.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { createPortalUser } from '../lib/users.js';

const router = Router();

// Credential stuffing / brute force is a multi-tenant-wide risk here — every
// university's accounts live in one users table behind this one endpoint.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too many login attempts, try again later' },
});

async function loadRoles(userId) {
  return unwrap(await supabase.from('user_roles').select('role, department_id, school_id').eq('user_id', userId));
}

function quickLoginsEnabled() {
  // Explicit opt-in only: set TEST_QUICK_LOGINS=true on the deployment's own
  // env vars (same flag as local) to expose the demo-login panel there too.
  // Anyone with the deployment URL can then sign in as any demo account,
  // including CRCS Superadmin, with no password — only enable on a
  // deployment your team controls access to (Vercel deployment protection,
  // a private URL, etc), never on a truly public production domain.
  return process.env.TEST_QUICK_LOGINS === 'true';
}

const QUICK_LEADERSHIP_EMAILS = [
  ['quick.superadmin@demo.srmap.test', 'CRCS Superadmin'],
  ['quick.coordinator@demo.srmap.test', 'CRCS Coordinator'],
  ['quick.faculty-coordinator@demo.srmap.test', 'Faculty Coordinator'],
  ['quick.hod@demo.srmap.test', 'CSE HOD'],
  ['quick.dean@demo.srmap.test', 'Engineering Dean'],
  ['quick.school-office@demo.srmap.test', 'School Office'],
];

async function quickAccessAccounts() {
  const university = unwrap(await supabase.from('universities').select('id,name,is_active').eq('code', 'SRMAP').maybeSingle());
  if (!university?.is_active) return { university, cycle: null, accounts: [] };
  const cycle = unwrap(await supabase.from('internship_cycles').select('id,name,status').eq('university_id', university.id).eq('name', '2023-2027').maybeSingle());
  if (!cycle || cycle.status !== 'open') return { university, cycle, accounts: [] };
  // Matched directly by the known seed emails/patterns, not by pulling the
  // whole cycle_participants membership first — that membership can grow
  // into the thousands (e.g. a bulk import), and an .in() over every member
  // id then exceeds PostgREST's request-size limit and 400s the whole panel.
  // These demo accounts are a small, fixed set regardless of cohort size.
  const [leadershipRows, facultyPool, studentPool] = await Promise.all([
    supabase.from('users').select('id,email,full_name').eq('university_id', university.id).eq('is_active', true).in('email', QUICK_LEADERSHIP_EMAILS.map(([email]) => email)),
    supabase.from('users').select('id,email,full_name').eq('university_id', university.id).eq('is_active', true).like('email', 'bulk-test-20260911-faculty%@example.edu').order('email').limit(10),
    supabase.from('users').select('id,email,full_name').eq('university_id', university.id).eq('is_active', true).like('email', 'bulk-test-20260911-student%@example.edu').order('email').limit(10),
  ]);
  const allIds = [...unwrap(leadershipRows), ...unwrap(facultyPool), ...unwrap(studentPool)].map((person) => person.id);
  const roleRows = allIds.length ? unwrap(await supabase.from('user_roles').select('user_id,role,department_id,school_id').in('user_id', allIds)) : [];
  const rolesByUser = Object.groupBy(roleRows, (row) => row.user_id);
  const withRoles = (rows) => rows.map((person) => ({ ...person, roles: rolesByUser[person.id] ?? [] }));
  const leadershipByEmail = new Map(withRoles(unwrap(leadershipRows)).map((account) => [account.email, account]));
  const leadership = QUICK_LEADERSHIP_EMAILS
    .map(([email, label]) => { const account = leadershipByEmail.get(email); return account ? { ...account, label, group: 'Oversight & coordination' } : null; })
    .filter(Boolean);
  const faculty = withRoles(unwrap(facultyPool)).map((person) => ({ ...person, label: 'Faculty', group: 'Faculty demo accounts' }));
  const students = withRoles(unwrap(studentPool)).map((person) => ({ ...person, label: 'Student', group: 'Student demo accounts' }));
  return { university, cycle, accounts: [...leadership, ...faculty, ...students] };
}

async function createLoginResponse(dbUser) {
  const roles = dbUser.is_platform_admin ? [] : await loadRoles(dbUser.id);
  const user = { id: dbUser.id, roles, university_id: dbUser.university_id, isPlatformAdmin: dbUser.is_platform_admin };
  return {
    accessToken: signAccessToken(user),
    refreshToken: signRefreshToken(user),
    user: {
      id: dbUser.id,
      email: dbUser.email,
      full_name: dbUser.full_name,
      roles,
      isPlatformAdmin: dbUser.is_platform_admin,
      must_change_password: !dbUser.last_login_at,
    },
  };
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

router.post('/login', loginLimiter, async (req, res) => {
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

  res.json(await createLoginResponse(dbUser));
});

// Demo-login helper, gated by TEST_QUICK_LOGINS — see quickLoginsEnabled() above.
router.get('/testing-accounts', async (_req, res) => {
  if (!quickLoginsEnabled()) return res.status(404).end();
  const demo = await quickAccessAccounts();
  if (!demo.university?.is_active || !demo.cycle || !demo.accounts.length) return res.status(503).json({ error: 'SRM AP 2023 demo accounts are unavailable' });
  res.json({ university: demo.university.name, cycle: demo.cycle.name, accounts: demo.accounts.map(({ id, ...account }) => account) });
});

router.post('/testing-login', loginLimiter, async (req, res) => {
  if (!quickLoginsEnabled()) return res.status(404).end();
  const parsed = z.object({ email: z.string().trim().toLowerCase().email() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid demo account' });
  const demo = await quickAccessAccounts();
  if (!demo.university?.is_active || !demo.cycle) return res.status(503).json({ error: 'SRM AP 2023 demo accounts are unavailable' });
  const selected = demo.accounts.find((account) => account.email === parsed.data.email);
  if (!selected) return res.status(404).json({ error: 'demo account not found' });
  const dbUser = unwrap(await supabase.from('users').select('*')
    .eq('email', parsed.data.email)
    .eq('university_id', demo.university.id)
    .eq('is_active', true)
    .maybeSingle());
  if (!dbUser) return res.status(404).json({ error: 'demo account not found' });
  res.json(await createLoginResponse(dbUser));
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
