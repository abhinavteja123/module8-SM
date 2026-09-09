import { Router } from 'express';
import { z } from 'zod';
import { supabase, unwrap } from '../db/client.js';
import { requireAuth, requireRole, scopeToDepartment } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';
import { requireFacultyMarksUnlocked } from '../lib/portalLocks.js';

const router = Router();

const MARK_FIELDS = ['weekly_report_score', 'mid_marks', 'synopsis_marks', 'thesis_marks', 'ppt_marks', 'viva_marks'];

async function isCurrentMentor(studentId, facultyId) {
  const [research, opportunity, selfInternship] = await Promise.all([
    supabase.from('mentor_assignments').select('id')
      .eq('student_id', studentId).eq('faculty_id', facultyId).eq('is_current', true).maybeSingle(),
    supabase.from('opportunity_applications').select('id')
      .eq('student_id', studentId).eq('assigned_mentor_id', facultyId).eq('status', 'crcs_approved').maybeSingle(),
    supabase.from('self_internships').select('id')
      .eq('student_id', studentId).eq('assigned_mentor_id', facultyId).eq('status', 'active').maybeSingle(),
  ]);
  return Boolean(unwrap(research) || unwrap(opportunity) || unwrap(selfInternship));
}

async function canView(req, studentId) {
  const roles = req.user.roles.map((r) => r.role);
  if (roles.includes('crcs_superadmin') || roles.includes('crcs_coordinator')) return true;
  if (roles.includes('faculty') && (await isCurrentMentor(studentId, req.user.id))) return true;
  if (roles.some((r) => ['hod', 'faculty_coordinator', 'dean'].includes(r))) {
    const scope = scopeToDepartment(req);
    const target = unwrap(
      await supabase.from('students').select('department_id, departments(school_id)').eq('id', studentId).maybeSingle()
    );
    if (!target) return false;
    if (scope.departmentIds?.includes(target.department_id)) return true;
    if (scope.schoolIds?.includes(target.departments?.school_id)) return true;
  }
  return false;
}

// CRCS needs a read-only programme view, not a separate request for every student.
router.get('/', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  let query = supabase.from('marks').select('*').order('updated_at', { ascending: false });
  if (req.query.cycle_id) query = query.eq('cycle_id', req.query.cycle_id);
  res.json(unwrap(await query));
});

router.get('/:student_id', requireAuth, async (req, res) => {
  if (!(await canView(req, req.params.student_id))) return res.status(403).json({ error: 'forbidden' });
  const { cycle_id } = req.query;
  if (cycle_id) {
    const row = unwrap(
      await supabase.from('marks').select('*').eq('student_id', req.params.student_id).eq('cycle_id', cycle_id).maybeSingle()
    );
    return res.json(row);
  }
  const rows = unwrap(
    await supabase.from('marks').select('*').eq('student_id', req.params.student_id).order('updated_at', { ascending: false })
  );
  res.json(rows);
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
  if (!(await requireFacultyMarksUnlocked(req.user.id, res))) return;
  const studentId = req.params.student_id;

  if (!(await isCurrentMentor(studentId, req.user.id))) {
    return res.status(403).json({ error: 'not the current mentor for this student' });
  }

  const { cycle_id, ...fields } = parsed.data;
  const present = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));

  const [updated] = unwrap(
    await supabase.from('marks')
      .upsert({ student_id: studentId, cycle_id, ...present, entered_by: req.user.id }, { onConflict: 'student_id,cycle_id' })
      .select()
  );

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

  const existing = unwrap(await supabase.from('marks').select('*').eq('student_id', studentId).eq('cycle_id', cycle_id).maybeSingle());
  const oldValue = existing?.[field_name] ?? null;
  const [result] = unwrap(await supabase.from('marks').upsert({
    student_id: studentId, cycle_id, [field_name]: new_value,
    entered_by: existing?.entered_by ?? req.user.id, last_overridden_by: req.user.id, updated_at: new Date().toISOString(),
  }, { onConflict: 'student_id,cycle_id' }).select());
  unwrap(await supabase.from('marks_override_log').insert({ marks_id: result.id, field_name, old_value: oldValue, new_value, overridden_by: req.user.id }));
  await logAudit({ actorId: req.user.id, actorRole: 'crcs_superadmin', action: 'override_marks', entityType: 'marks', entityId: result.id, oldValue: { [field_name]: oldValue }, newValue: { [field_name]: new_value } });
  res.json(result);
});

export default router;
