import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/client.js';
import { requireAuth, requireRole, scopeToDepartment } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';

const router = Router();

const MARK_FIELDS = ['weekly_report_score', 'mid_marks', 'synopsis_marks', 'thesis_marks', 'ppt_marks', 'viva_marks'];

async function canView(req, studentId) {
  const roles = req.user.roles.map((r) => r.role);
  if (roles.includes('crcs_superadmin') || roles.includes('crcs_coordinator')) return true;
  if (req.user.id === studentId) return true;
  if (roles.includes('faculty')) {
    const { rows } = await pool.query(
      `SELECT 1 FROM mentor_assignments WHERE student_id = $1 AND faculty_id = $2 AND is_current = true`,
      [studentId, req.user.id]
    );
    if (rows.length) return true;
  }
  if (roles.some((r) => ['hod', 'faculty_coordinator', 'dean'].includes(r))) {
    const scope = scopeToDepartment(req);
    const { rows } = await pool.query(
      `SELECT s.department_id, d.school_id FROM students s JOIN departments d ON d.id = s.department_id WHERE s.id = $1`,
      [studentId]
    );
    const target = rows[0];
    if (!target) return false;
    if (scope.departmentIds?.includes(target.department_id)) return true;
    if (scope.schoolIds?.includes(target.school_id)) return true;
  }
  return false;
}

router.get('/:student_id', requireAuth, async (req, res) => {
  if (!(await canView(req, req.params.student_id))) return res.status(403).json({ error: 'forbidden' });
  const { cycle_id } = req.query;
  const { rows } = cycle_id
    ? await pool.query('SELECT * FROM marks WHERE student_id = $1 AND cycle_id = $2', [req.params.student_id, cycle_id])
    : await pool.query('SELECT * FROM marks WHERE student_id = $1 ORDER BY updated_at DESC', [req.params.student_id]);
  res.json(cycle_id ? (rows[0] ?? null) : rows);
});

const putSchema = z.object({
  cycle_id: z.string().uuid(),
  weekly_report_score: z.coerce.number().optional(),
  mid_marks: z.coerce.number().optional(),
  synopsis_marks: z.coerce.number().optional(),
  thesis_marks: z.coerce.number().optional(),
  ppt_marks: z.coerce.number().optional(),
  viva_marks: z.coerce.number().optional(),
});

router.put('/:student_id', requireAuth, requireRole('faculty'), async (req, res) => {
  const parsed = putSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const studentId = req.params.student_id;

  const { rows: [assignment] } = await pool.query(
    `SELECT 1 FROM mentor_assignments WHERE student_id = $1 AND faculty_id = $2 AND is_current = true`,
    [studentId, req.user.id]
  );
  if (!assignment) return res.status(403).json({ error: 'not the current mentor for this student' });

  const { cycle_id, ...fields } = parsed.data;
  const present = Object.entries(fields).filter(([, v]) => v !== undefined);

  const { rows: [oldRow] } = await pool.query('SELECT * FROM marks WHERE student_id = $1 AND cycle_id = $2', [studentId, cycle_id]);

  const cols = ['student_id', 'cycle_id', ...present.map(([k]) => k), 'entered_by'];
  const vals = [studentId, cycle_id, ...present.map(([, v]) => v), req.user.id];
  const placeholders = vals.map((_, i) => `$${i + 1}`);
  const updateSet = [...present.map(([k]) => `${k} = EXCLUDED.${k}`), 'entered_by = EXCLUDED.entered_by', 'updated_at = now()'].join(', ');

  const { rows: [updated] } = await pool.query(
    `INSERT INTO marks (${cols.join(', ')}) VALUES (${placeholders.join(', ')})
     ON CONFLICT (student_id, cycle_id) DO UPDATE SET ${updateSet}
     RETURNING *`,
    vals
  );

  await logAudit(pool, {
    actorId: req.user.id, actorRole: 'faculty', action: 'enter_marks',
    entityType: 'marks', entityId: updated.id, oldValue: oldRow ?? null, newValue: updated,
  });

  res.json(updated);
});

const overrideSchema = z.object({
  cycle_id: z.string().uuid(),
  field_name: z.enum(MARK_FIELDS),
  new_value: z.coerce.number(),
});

router.patch('/:student_id/override', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const parsed = overrideSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { cycle_id, field_name, new_value } = parsed.data;
  const studentId = req.params.student_id;

  const { rows: [marksRow] } = await pool.query('SELECT * FROM marks WHERE student_id = $1 AND cycle_id = $2', [studentId, cycle_id]);
  if (!marksRow) return res.status(404).json({ error: 'no marks entered yet for this student/cycle' });

  const oldValue = marksRow[field_name];

  const { rows: [updated] } = await pool.query(
    `UPDATE marks SET ${field_name} = $1, last_overridden_by = $2, updated_at = now() WHERE id = $3 RETURNING *`,
    [new_value, req.user.id, marksRow.id]
  );

  await pool.query(
    `INSERT INTO marks_override_log (marks_id, field_name, old_value, new_value, overridden_by) VALUES ($1,$2,$3,$4,$5)`,
    [marksRow.id, field_name, oldValue, new_value, req.user.id]
  );
  await logAudit(pool, {
    actorId: req.user.id, actorRole: 'crcs_superadmin', action: 'override_marks',
    entityType: 'marks', entityId: marksRow.id, oldValue: { [field_name]: oldValue }, newValue: { [field_name]: new_value },
  });

  res.json(updated);
});

export default router;
