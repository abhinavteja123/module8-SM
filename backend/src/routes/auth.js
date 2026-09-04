import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '../db/client.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/jwt.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

async function loadRoles(userId) {
  const { rows } = await pool.query(
    'SELECT role, department_id, school_id FROM user_roles WHERE user_id = $1',
    [userId]
  );
  return rows;
}

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().min(1),
  phone: z.string().optional(),
  roles: z.array(z.object({
    role: z.enum(['student', 'faculty', 'faculty_coordinator', 'hod', 'crcs_coordinator', 'crcs_superadmin', 'dean']),
    department_id: z.string().uuid().optional(),
    school_id: z.string().uuid().optional(),
  })).min(1),
});

// No public signup — only CRCS Superadmin creates accounts (§8).
router.post('/register', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email, password, full_name, phone, roles } = parsed.data;

  const password_hash = await bcrypt.hash(password, 10);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO users (email, password_hash, full_name, phone) VALUES ($1,$2,$3,$4) RETURNING id, email, full_name`,
      [email, password_hash, full_name, phone ?? null]
    );
    const user = rows[0];
    for (const r of roles) {
      await client.query(
        `INSERT INTO user_roles (user_id, role, department_id, school_id) VALUES ($1,$2,$3,$4)`,
        [user.id, r.role, r.department_id ?? null, r.school_id ?? null]
      );
      if (r.role === 'student' && r.department_id) {
        await client.query(
          `INSERT INTO students (id, roll_number, department_id, batch_year) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING`,
          [user.id, `PENDING-${user.id.slice(0, 8)}`, r.department_id, new Date().getFullYear()]
        );
      }
      if ((r.role === 'faculty' || r.role === 'faculty_coordinator') && r.department_id) {
        await client.query(
          `INSERT INTO faculty (id, department_id) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING`,
          [user.id, r.department_id]
        );
      }
    }
    await client.query('COMMIT');
    res.status(201).json({ id: user.id, email: user.email, full_name: user.full_name });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

const loginSchema = z.object({ email: z.string().email(), password: z.string() });

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email, password } = parsed.data;

  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1 AND is_active = true', [email]);
  const dbUser = rows[0];
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
