import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/client.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';

const router = Router();

router.get('/cycles/current', requireAuth, async (req, res) => {
  const { rows: [cycle] } = await pool.query(
    `SELECT * FROM internship_cycles WHERE status = 'open' ORDER BY preference_window_opens_at DESC LIMIT 1`
  );
  if (!cycle) return res.status(404).json({ error: 'no open cycle' });
  res.json(cycle);
});

const cycleSchema = z.object({
  name: z.string().min(1),
  preference_window_opens_at: z.string(),
  preference_window_closes_at: z.string().optional(),
});

router.post('/cycles', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const parsed = cycleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { name, preference_window_opens_at, preference_window_closes_at } = parsed.data;
  const { rows: [cycle] } = await pool.query(
    `INSERT INTO internship_cycles (name, preference_window_opens_at, preference_window_closes_at, status, created_by)
     VALUES ($1,$2,$3,'open',$4) RETURNING *`,
    [name, preference_window_opens_at, preference_window_closes_at ?? null, req.user.id]
  );
  await logAudit(pool, {
    actorId: req.user.id, actorRole: 'crcs_superadmin', action: 'create_cycle',
    entityType: 'internship_cycles', entityId: cycle.id, newValue: cycle,
  });
  res.status(201).json(cycle);
});

const trackSelectionSchema = z.object({
  cycle_id: z.string().uuid(),
  track: z.enum(['research', 'crcs_opportunity', 'self_internship']),
  questionnaire_response: z.record(z.any()).optional(),
});

router.post('/students/me/track-selection', requireAuth, requireRole('student'), async (req, res) => {
  const parsed = trackSelectionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { cycle_id, track, questionnaire_response } = parsed.data;
  try {
    const { rows: [selection] } = await pool.query(
      `INSERT INTO student_track_selections (student_id, cycle_id, track, questionnaire_response)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.user.id, cycle_id, track, questionnaire_response ? JSON.stringify(questionnaire_response) : null]
    );
    res.status(201).json(selection);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'already selected this track for this cycle' });
    res.status(400).json({ error: err.message });
  }
});

const questionnaireSchema = z.object({ cycle_id: z.string().uuid(), responses: z.record(z.any()) });

router.post('/students/me/questionnaire', requireAuth, requireRole('student'), async (req, res) => {
  const parsed = questionnaireSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { cycle_id, responses } = parsed.data;
  const { rows } = await pool.query(
    `UPDATE student_track_selections SET questionnaire_response = $1
     WHERE student_id = $2 AND cycle_id = $3 RETURNING *`,
    [JSON.stringify(responses), req.user.id, cycle_id]
  );
  if (!rows.length) return res.status(404).json({ error: 'no track selection found for this cycle — select a track first' });
  res.json(rows[0]);
});

export default router;
