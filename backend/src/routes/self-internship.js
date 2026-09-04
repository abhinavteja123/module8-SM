import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/client.js';
import { requireAuth, requireRole, scopeToDepartment } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';
import { notify } from '../lib/notifications.js';

const router = Router();

const postSchema = z.object({
  cycle_id: z.string().uuid(),
  company_name: z.string().min(1),
  company_profile_doc_id: z.string().uuid().optional(),
  offer_letter_doc_id: z.string().uuid().optional(),
});

router.post('/', requireAuth, requireRole('student'), async (req, res) => {
  const parsed = postSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;

  const { rows: [mentor] } = await pool.query(
    `SELECT faculty_id FROM mentor_assignments WHERE student_id = $1 AND is_current = true LIMIT 1`,
    [req.user.id]
  );

  const { rows: [rec] } = await pool.query(
    `INSERT INTO self_internships (student_id, cycle_id, company_name, company_profile_doc_id, offer_letter_doc_id, assigned_mentor_id, status)
     VALUES ($1,$2,$3,$4,$5,$6,'submitted') RETURNING *`,
    [req.user.id, d.cycle_id, d.company_name, d.company_profile_doc_id ?? null, d.offer_letter_doc_id ?? null, mentor?.faculty_id ?? null]
  );

  await logAudit(pool, { actorId: req.user.id, actorRole: 'student', action: 'submit_self_internship', entityType: 'self_internships', entityId: rec.id, newValue: rec });

  if (!mentor) {
    return res.status(202).json({ ...rec, note: 'no mentor assigned yet, routes to department faculty coordinator for assignment' });
  }
  await notify(pool, { userId: mentor.faculty_id, title: 'New self-internship for review', relatedEntityType: 'self_internship', relatedEntityId: rec.id });
  res.status(201).json(rec);
});

const decisionSchema = z.object({ decision: z.enum(['approve', 'reject']), reason: z.string().optional() });

router.patch('/:id/mentor-decision', requireAuth, requireRole('faculty'), async (req, res) => {
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { decision, reason } = parsed.data;

  const { rows: [rec] } = await pool.query('SELECT * FROM self_internships WHERE id = $1', [req.params.id]);
  if (!rec) return res.status(404).json({ error: 'not found' });
  if (rec.assigned_mentor_id !== req.user.id) return res.status(403).json({ error: 'not the assigned mentor' });
  if (rec.status !== 'submitted') return res.status(400).json({ error: `cannot decide from status ${rec.status}` });

  const status = decision === 'approve' ? 'mentor_approved' : 'rejected';
  const { rows: [updated] } = await pool.query(
    `UPDATE self_internships SET status=$1, mentor_decision_by=$2, mentor_decision_at=now(),
       rejection_reason=$3, rejected_by_role=$4, updated_at=now() WHERE id=$5 RETURNING *`,
    [status, req.user.id, decision === 'reject' ? (reason ?? null) : null, decision === 'reject' ? 'faculty' : null, req.params.id]
  );

  await logAudit(pool, { actorId: req.user.id, actorRole: 'faculty', action: `self_internship_mentor_${decision}`, entityType: 'self_internships', entityId: rec.id, oldValue: { status: rec.status }, newValue: { status } });
  await notify(pool, { userId: rec.student_id, title: `Self-internship ${status}`, body: reason ?? null, relatedEntityType: 'self_internship', relatedEntityId: rec.id });
  res.json(updated);
});

router.patch('/:id/crcs-decision', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { decision, reason } = parsed.data;

  const { rows: [rec] } = await pool.query('SELECT * FROM self_internships WHERE id = $1', [req.params.id]);
  if (!rec) return res.status(404).json({ error: 'not found' });
  if (rec.status !== 'mentor_approved') return res.status(400).json({ error: `cannot CRCS-decide from status ${rec.status}, needs mentor_approved` });

  const status = decision === 'approve' ? 'active' : 'rejected';
  const { rows: [updated] } = await pool.query(
    `UPDATE self_internships SET status=$1, crcs_decision_by=$2, crcs_decision_at=now(),
       rejection_reason=$3, rejected_by_role=$4, updated_at=now() WHERE id=$5 RETURNING *`,
    [status, req.user.id, decision === 'reject' ? (reason ?? null) : null, decision === 'reject' ? 'crcs_superadmin' : null, req.params.id]
  );

  await logAudit(pool, { actorId: req.user.id, actorRole: 'crcs_superadmin', action: `self_internship_crcs_${decision}`, entityType: 'self_internships', entityId: rec.id, oldValue: { status: rec.status }, newValue: { status } });
  await notify(pool, { userId: rec.student_id, title: `Self-internship ${status}`, body: reason ?? null, relatedEntityType: 'self_internship', relatedEntityId: rec.id });
  res.json(updated);
});

router.get('/:id', requireAuth, async (req, res) => {
  const { rows: [rec] } = await pool.query(
    `SELECT si.*, s.department_id FROM self_internships si JOIN students s ON s.id = si.student_id WHERE si.id = $1`,
    [req.params.id]
  );
  if (!rec) return res.status(404).json({ error: 'not found' });

  const isOwner = rec.student_id === req.user.id;
  const isMentor = rec.assigned_mentor_id === req.user.id;
  const roles = req.user.roles.map((r) => r.role);
  const isCrcs = roles.includes('crcs_superadmin') || roles.includes('crcs_coordinator');
  const { departmentIds, isSystemWide } = scopeToDepartment(req);
  const isScopedCoordinator = isSystemWide || (departmentIds && departmentIds.includes(rec.department_id));

  if (!isOwner && !isMentor && !isCrcs && !isScopedCoordinator) return res.status(403).json({ error: 'forbidden' });
  res.json(rec);
});

const certSchema = z.object({ certificate_doc_id: z.string().uuid() });

router.patch('/:id/certificate', requireAuth, requireRole('student'), async (req, res) => {
  const parsed = certSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { rows: [rec] } = await pool.query('SELECT * FROM self_internships WHERE id = $1', [req.params.id]);
  if (!rec) return res.status(404).json({ error: 'not found' });
  if (rec.student_id !== req.user.id) return res.status(403).json({ error: 'forbidden' });
  if (rec.status !== 'active') return res.status(400).json({ error: `cannot upload certificate from status ${rec.status}` });

  const { rows: [updated] } = await pool.query(
    `UPDATE self_internships SET certificate_doc_id=$1, status='completed', updated_at=now() WHERE id=$2 RETURNING *`,
    [parsed.data.certificate_doc_id, req.params.id]
  );
  res.json(updated);
});

export default router;
