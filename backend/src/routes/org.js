import { Router } from 'express';
import { pool } from '../db/client.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/schools', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM schools ORDER BY name');
  res.json(rows);
});

router.get('/departments', requireAuth, async (req, res) => {
  const { school_id } = req.query;
  const { rows } = school_id
    ? await pool.query('SELECT * FROM departments WHERE school_id = $1 ORDER BY name', [school_id])
    : await pool.query('SELECT * FROM departments ORDER BY name');
  res.json(rows);
});

router.get('/users/me', requireAuth, async (req, res) => {
  const { rows: [user] } = await pool.query(
    'SELECT id, email, full_name, phone, is_active FROM users WHERE id = $1',
    [req.user.id]
  );
  if (!user) return res.status(404).json({ error: 'not found' });
  res.json({ ...user, roles: req.user.roles });
});

export default router;
