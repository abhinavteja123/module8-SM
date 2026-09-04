import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../db/client.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';
import { notify } from '../lib/notifications.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const { cycle_id } = req.query;
  const { rows } = cycle_id
    ? await pool.query('SELECT * FROM crcs_opportunities WHERE cycle_id = $1 ORDER BY created_at DESC', [cycle_id])
    : await pool.query('SELECT * FROM crcs_opportunities ORDER BY created_at DESC');
  res.json(rows);
});

const postSchema = z.object({
  cycle_id: z.string().uuid(),
  title: z.string().min(1),
  organization_name: z.string().min(1),
  description: z.string().optional(),
  eligibility: z.string().optional(),
  application_deadline: z.string().optional(),
});

router.post('/', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const parsed = postSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;
  const { rows: [opp] } = await pool.query(
    `INSERT INTO crcs_opportunities (cycle_id, title, organization_name, description, eligibility, application_deadline, posted_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [d.cycle_id, d.title, d.organization_name, d.description ?? null, d.eligibility ?? null, d.application_deadline ?? null, req.user.id]
  );
  await logAudit(pool, { actorId: req.user.id, actorRole: 'crcs_superadmin', action: 'post_opportunity', entityType: 'crcs_opportunities', entityId: opp.id, newValue: opp });
  res.status(201).json(opp);
});

router.post('/:id/apply', requireAuth, requireRole('student'), async (req, res) => {
  try {
    const { rows: [app] } = await pool.query(
      `INSERT INTO opportunity_applications (student_id, opportunity_id, status) VALUES ($1,$2,'applied') RETURNING *`,
      [req.user.id, req.params.id]
    );
    res.status(201).json(app);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

const transitions = {
  applied: ['under_review', 'rejected'],
  under_review: ['offered', 'rejected'],
  offered: ['crcs_approved', 'rejected'],
};

const statusSchema = z.object({
  status: z.enum(['under_review', 'offered', 'crcs_approved', 'rejected']),
  reason: z.string().optional(),
});

router.patch('/applications/:id/status', requireAuth, requireRole('crcs_superadmin', 'crcs_coordinator'), async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { status, reason } = parsed.data;

  try {
    const result = await withTransaction(async (db) => {
      const { rows: [app] } = await db.query('SELECT * FROM opportunity_applications WHERE id = $1 FOR UPDATE', [req.params.id]);
      if (!app) throw Object.assign(new Error('not found'), { status: 404 });
      const allowed = transitions[app.status] || [];
      if (!allowed.includes(status)) throw Object.assign(new Error(`illegal transition ${app.status} -> ${status}`), { status: 400 });

      const { rows: [updated] } = await db.query(
        `UPDATE opportunity_applications SET status=$1, decision_by=$2, decision_at=now(), rejection_reason=$3, updated_at=now()
         WHERE id=$4 RETURNING *`,
        [status, req.user.id, status === 'rejected' ? (reason ?? null) : null, req.params.id]
      );

      if (status === 'crcs_approved') {
        await db.query(
          `UPDATE research_applications SET status='revoked', rejection_reason='auto-revoked: student approved elsewhere', updated_at=now()
           WHERE student_id=$1 AND status IN ('pending_faculty','faculty_approved','pending_crcs_approval')`,
          [app.student_id]
        );
      }

      await logAudit(db, {
        actorId: req.user.id, actorRole: req.user.roles[0]?.role, action: `opportunity_application_${status}`,
        entityType: 'opportunity_applications', entityId: app.id, oldValue: { status: app.status }, newValue: { status },
      });
      await notify(db, {
        userId: app.student_id, title: `Opportunity application ${status}`,
        body: reason ?? null, relatedEntityType: 'opportunity_application', relatedEntityId: app.id,
      });
      return updated;
    });
    res.json(result);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

export default router;
