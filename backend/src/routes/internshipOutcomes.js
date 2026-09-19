import { Router } from 'express';
import { z } from 'zod';
import { supabase, unwrap } from '../db/client.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

// ponytail: analytics-only outcome data (mode/paid-unpaid/stipend/country/domain).
// Deliberately its own route/table, never read by any "view one student" screen —
// see the migration's header comment for why.
const router = Router();

const submitSchema = z.object({
  source_type: z.enum(['self_internship', 'crcs_opportunity']),
  source_id: z.string().uuid(),
  mode: z.enum(['online', 'offline']).optional(),
  duration_months: z.coerce.number().min(0).max(120).optional(),
  nature: z.enum(['paid', 'unpaid']),
  stipend_amount: z.coerce.number().min(0).optional(),
  company_country: z.string().trim().max(120).optional(),
  domain_sector: z.string().trim().max(120).optional(),
  recruiter_feedback_doc_id: z.string().uuid().optional(),
});

async function resolveOwnedRecord(sourceType, sourceId, studentId) {
  if (sourceType === 'self_internship') {
    const rec = unwrap(await supabase.from('self_internships').select('id,student_id,cycle_id,status').eq('id', sourceId).maybeSingle());
    if (!rec || rec.student_id !== studentId) return { error: 'not found' };
    // ponytail: the certificate endpoint that flips status to 'completed' has no
    // frontend caller yet, so 'active' (mentor assigned, offer approved) is the
    // realistic gate today; 'completed' still accepted once that wiring exists.
    if (!['active', 'completed'].includes(rec.status)) return { error: `internship outcome can only be added once the record is active or completed (currently ${rec.status})` };
    return { cycleId: rec.cycle_id };
  }
  const rec = unwrap(await supabase.from('opportunity_applications').select('id,student_id,status,opportunity_id,crcs_opportunities(cycle_id)').eq('id', sourceId).maybeSingle());
  if (!rec || rec.student_id !== studentId) return { error: 'not found' };
  if (rec.status !== 'crcs_approved') return { error: `internship outcome can only be added once the application is CRCS-approved (currently ${rec.status})` };
  return { cycleId: rec.crcs_opportunities?.cycle_id };
}

router.post('/', requireAuth, requireRole('student'), async (req, res) => {
  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { source_type, source_id, ...fields } = parsed.data;

  const owned = await resolveOwnedRecord(source_type, source_id, req.user.id);
  if (owned.error) return res.status(400).json({ error: owned.error });

  const [row] = unwrap(await supabase.from('internship_outcomes').upsert({
    student_id: req.user.id,
    university_id: req.user.university_id,
    cycle_id: owned.cycleId,
    source_type,
    source_id,
    submitted_by: req.user.id,
    updated_at: new Date().toISOString(),
    ...fields,
  }, { onConflict: 'source_type,source_id' }).select());
  res.status(201).json(row);
});

router.get('/mine', requireAuth, requireRole('student'), async (req, res) => {
  const parsed = z.object({ source_type: z.enum(['self_internship', 'crcs_opportunity']), source_id: z.string().uuid() }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const row = unwrap(await supabase.from('internship_outcomes').select('*').eq('student_id', req.user.id).eq('source_type', parsed.data.source_type).eq('source_id', parsed.data.source_id).maybeSingle());
  res.json(row ?? null);
});

const correctionSchema = submitSchema.omit({ source_type: true, source_id: true }).partial();

router.patch('/:id', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const parsed = correctionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const existing = unwrap(await supabase.from('internship_outcomes').select('id,university_id').eq('id', req.params.id).maybeSingle());
  if (!existing || existing.university_id !== req.user.university_id) return res.status(404).json({ error: 'not found' });
  const [row] = unwrap(await supabase.from('internship_outcomes').update({ ...parsed.data, updated_at: new Date().toISOString() }).eq('id', req.params.id).select());
  res.json(row);
});

export default router;
