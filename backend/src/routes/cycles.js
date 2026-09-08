import { Router } from 'express';
import { z } from 'zod';
import { supabase, unwrap } from '../db/client.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';
import { findApprovedInternship } from '../lib/internshipExclusivity.js';

const router = Router();

router.get('/cycles/current', requireAuth, async (req, res) => {
  const cycle = unwrap(
    await supabase.from('internship_cycles').select('*').eq('status', 'open')
      .order('preference_window_opens_at', { ascending: false }).limit(1).maybeSingle()
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
  const [cycle] = unwrap(await supabase.from('internship_cycles').insert({
    name, preference_window_opens_at, preference_window_closes_at: preference_window_closes_at ?? null,
    status: 'open', created_by: req.user.id,
  }).select());
  await logAudit({
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

async function hasApprovedInternship(studentId) {
  return Boolean(await findApprovedInternship(studentId));
}

router.post('/students/me/track-selection', requireAuth, requireRole('student'), async (req, res) => {
  const parsed = trackSelectionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { cycle_id, track, questionnaire_response } = parsed.data;
  const cycle = unwrap(await supabase.from('internship_cycles').select('id,preference_changes_locked').eq('id', cycle_id).maybeSingle());
  if (!cycle) return res.status(404).json({ error: 'internship cycle not found' });
  const current = unwrap(await supabase.from('student_track_selections').select('*').eq('student_id', req.user.id).eq('cycle_id', cycle_id).order('created_at', { ascending: false }).limit(1).maybeSingle());
  if (await hasApprovedInternship(req.user.id)) {
    if (current?.track === track) return res.json({ selection: current, unchanged: true, approval_locked: true });
    return res.status(403).json({ error: 'your internship preference is locked after approval. Please contact the CRCS administrator in person if a change is needed.' });
  }

  if (cycle.preference_changes_locked && current && current.track !== track) {
    const pending = unwrap(await supabase.from('student_preference_change_requests').select('id').eq('student_id', req.user.id).eq('cycle_id', cycle_id).eq('status', 'pending').maybeSingle());
    if (pending) return res.status(409).json({ error: 'a preference-change request is already waiting for CRCS' });
    const [request] = unwrap(await supabase.from('student_preference_change_requests').insert({ student_id: req.user.id, cycle_id, current_track: current.track, requested_track: track }).select());
    await logAudit({ actorId: req.user.id, actorRole: 'student', action: 'request_track_change', entityType: 'student_preference_change_requests', entityId: request.id, newValue: { current_track: current.track, requested_track: track } });
    return res.status(202).json({ requires_approval: true, request });
  }

  if (cycle.preference_changes_locked && current?.track === track) return res.json({ selection: current, unchanged: true });
  unwrap(await supabase.from('student_track_selections').delete().eq('student_id', req.user.id).eq('cycle_id', cycle_id));
  const [selection] = unwrap(await supabase.from('student_track_selections').insert({ student_id: req.user.id, cycle_id, track, questionnaire_response: questionnaire_response ?? null }).select());
  await logAudit({ actorId: req.user.id, actorRole: 'student', action: 'select_internship_track', entityType: 'student_track_selections', entityId: selection.id, newValue: { cycle_id, track } });
  res.status(201).json({ selection });
});

// This is deliberately independent of the currently open cycle. A student
// must not see another Apply action merely because CRCS has closed the cycle
// in which their internship was approved.
router.get('/students/me/internship-status', requireAuth, requireRole('student'), async (req, res) => {
  const internship = await findApprovedInternship(req.user.id);
  res.json({ approved: Boolean(internship), internship });
});

router.get('/students/me/track-selection', requireAuth, requireRole('student'), async (req, res) => {
  const cycleId = req.query.cycle_id;
  const cycle = cycleId
    ? unwrap(await supabase.from('internship_cycles').select('id,name,preference_changes_locked').eq('id', cycleId).maybeSingle())
    : unwrap(await supabase.from('internship_cycles').select('id,name,preference_changes_locked').eq('status', 'open').order('preference_window_opens_at', { ascending: false }).limit(1).maybeSingle());
  if (!cycle) return res.status(404).json({ error: 'no internship cycle found' });
  const selection = unwrap(await supabase.from('student_track_selections').select('*').eq('student_id', req.user.id).eq('cycle_id', cycle.id).order('created_at', { ascending: false }).limit(1).maybeSingle());
  const pendingRequest = unwrap(await supabase.from('student_preference_change_requests').select('*').eq('student_id', req.user.id).eq('cycle_id', cycle.id).eq('status', 'pending').maybeSingle());
  res.json({ cycle, selection: selection ?? null, pending_request: pendingRequest ?? null, approval_locked: await hasApprovedInternship(req.user.id) });
});

const questionnaireSchema = z.object({ cycle_id: z.string().uuid(), responses: z.record(z.any()) });

router.post('/students/me/questionnaire', requireAuth, requireRole('student'), async (req, res) => {
  const parsed = questionnaireSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { cycle_id, responses } = parsed.data;
  const rows = unwrap(
    await supabase.from('student_track_selections').update({ questionnaire_response: responses })
      .eq('student_id', req.user.id).eq('cycle_id', cycle_id).select()
  );
  if (!rows.length) return res.status(404).json({ error: 'no track selection found for this cycle — select a track first' });
  res.json(rows[0]);
});

export default router;
