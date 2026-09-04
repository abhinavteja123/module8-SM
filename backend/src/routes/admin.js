import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '../db/client.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';

const router = Router();

const createUserSchema = z.object({
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

router.post('/users', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email, password, full_name, phone, roles } = parsed.data;
  const password_hash = await bcrypt.hash(password, 10);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [user] } = await client.query(
      `INSERT INTO users (email, password_hash, full_name, phone) VALUES ($1,$2,$3,$4) RETURNING id, email, full_name`,
      [email, password_hash, full_name, phone ?? null]
    );
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
    await logAudit(pool, {
      actorId: req.user.id, actorRole: 'crcs_superadmin', action: 'create_user',
      entityType: 'users', entityId: user.id, newValue: { email, full_name, roles },
    });
    res.status(201).json(user);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

const rolesSchema = z.object({
  roles: z.array(z.object({
    role: z.enum(['student', 'faculty', 'faculty_coordinator', 'hod', 'crcs_coordinator', 'crcs_superadmin', 'dean']),
    department_id: z.string().uuid().optional(),
    school_id: z.string().uuid().optional(),
  })),
});

router.patch('/users/:id/roles', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const parsed = rolesSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { id } = req.params;
  const { rows: oldRoles } = await pool.query('SELECT role, department_id, school_id FROM user_roles WHERE user_id = $1', [id]);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM user_roles WHERE user_id = $1', [id]);
    for (const r of parsed.data.roles) {
      await client.query(
        `INSERT INTO user_roles (user_id, role, department_id, school_id) VALUES ($1,$2,$3,$4)`,
        [id, r.role, r.department_id ?? null, r.school_id ?? null]
      );
    }
    await client.query('COMMIT');
    await logAudit(pool, {
      actorId: req.user.id, actorRole: 'crcs_superadmin', action: 'update_user_roles',
      entityType: 'users', entityId: id, oldValue: oldRoles, newValue: parsed.data.roles,
    });
    res.json({ id, roles: parsed.data.roles });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

const permissionsSchema = z.object({
  permissions: z.array(z.object({ permission_key: z.string(), granted: z.boolean() })),
});

router.put('/admin/crcs-coordinator-permissions/:user_id', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const parsed = permissionsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { user_id } = req.params;
  for (const p of parsed.data.permissions) {
    await pool.query(
      `INSERT INTO crcs_coordinator_permissions (coordinator_id, permission_key, granted, granted_by)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (coordinator_id, permission_key) DO UPDATE SET granted = $3, granted_by = $4, updated_at = now()`,
      [user_id, p.permission_key, p.granted, req.user.id]
    );
  }
  await logAudit(pool, {
    actorId: req.user.id, actorRole: 'crcs_superadmin', action: 'update_crcs_coordinator_permissions',
    entityType: 'crcs_coordinator_permissions', entityId: user_id, newValue: parsed.data.permissions,
  });
  res.json({ user_id, permissions: parsed.data.permissions });
});

router.get('/audit-log', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const { entity_type, entity_id } = req.query;
  const conditions = [];
  const params = [];
  if (entity_type) { params.push(entity_type); conditions.push(`entity_type = $${params.length}`); }
  if (entity_id) { params.push(entity_id); conditions.push(`entity_id = $${params.length}`); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT 200`,
    params
  );
  res.json(rows);
});

export default router;
