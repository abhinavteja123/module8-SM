import { Router } from 'express';
import { z } from 'zod';
import { supabase, unwrap } from '../db/client.js';
import { requireAuth, requireRole, requireCrcsPermission, scopeToDepartment } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';
import { requireFacultyMarksUnlocked } from '../lib/portalLocks.js';
import { requireVisibleCycle } from '../lib/cycleVisibility.js';

const router = Router();

const MARK_FIELDS = ['weekly_report_score', 'mid_marks', 'synopsis_marks', 'thesis_marks', 'ppt_marks', 'viva_marks'];

async function dynamicAssessment(studentId, cycleId, track) {
  let requirementsQuery = supabase.from('report_requirements').select('*').eq('is_active', true).order('sort_order').order('created_at');
  if (track) requirementsQuery = requirementsQuery.or(`track.is.null,track.eq.${track}`);
  const requirements = unwrap(await requirementsQuery);
  const scores = cycleId && requirements.length
    ? unwrap(await supabase.from('student_report_scores').select('*').eq('student_id', studentId).eq('cycle_id', cycleId).in('report_requirement_id', requirements.map((item) => item.id)))
    : [];
  const scoreByRequirement = new Map(scores.map((score) => [score.report_requirement_id, score]));
  const components = requirements.map((requirement) => ({ ...requirement, score: scoreByRequirement.get(requirement.id)?.score ?? null }));
  return { requirements: components, total: components.reduce((sum, item) => sum + (Number(item.score) || 0), 0), maximum: components.reduce((sum, item) => sum + Number(item.max_marks || 0), 0) };
}

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
router.get('/', requireAuth, requireRole('crcs_superadmin', 'crcs_coordinator'), requireCrcsPermission('view_marks'), async (req, res) => {
  if (req.query.cycle_id && !(await requireVisibleCycle(req, res, req.query.cycle_id))) return;
  let query = supabase.from('marks').select('*').order('updated_at', { ascending: false });
  if (req.query.cycle_id) query = query.eq('cycle_id', req.query.cycle_id);
  res.json(unwrap(await query));
});

router.get('/:student_id', requireAuth, async (req, res) => {
  if (!(await canView(req, req.params.student_id))) return res.status(403).json({ error: 'forbidden' });
  const { cycle_id } = req.query;
  if (cycle_id) {
    if (!(await requireVisibleCycle(req, res, cycle_id))) return;
    const row = unwrap(
      await supabase.from('marks').select('*').eq('student_id', req.params.student_id).eq('cycle_id', cycle_id).maybeSingle()
    );
    const assessment = await dynamicAssessment(req.params.student_id, cycle_id, req.query.track);
    return res.json(row ? { ...row, ...assessment } : { student_id: req.params.student_id, cycle_id, ...assessment });
  }
  const rows = unwrap(
    await supabase.from('marks').select('*').eq('student_id', req.params.student_id).order('updated_at', { ascending: false })
  );
  res.json(rows);
});

const putSchema = z.object({
  cycle_id: z.string().uuid(),
  track: z.enum(['research', 'crcs_opportunity', 'self_internship']).optional(),
  weekly_report_score: z.coerce.number().optional(),
  mid_marks: z.coerce.number().optional(),
  synopsis_marks: z.coerce.number().optional(),
  thesis_marks: z.coerce.number().optional(),
  ppt_marks: z.coerce.number().optional(),
  viva_marks: z.coerce.number().optional(),
  component_scores: z.array(z.object({
    report_requirement_id: z.string().uuid(),
    score: z.coerce.number().min(0),
  })).optional(),
});

router.put('/:student_id', requireAuth, requireRole('faculty'), async (req, res) => {
  const parsed = putSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!(await requireFacultyMarksUnlocked(req.user.id, res))) return;
  const studentId = req.params.student_id;

  if (!(await isCurrentMentor(studentId, req.user.id))) {
    return res.status(403).json({ error: 'not the current mentor for this student' });
  }

  const { cycle_id, component_scores, track, ...fields } = parsed.data;
  if (!(await requireVisibleCycle(req, res, cycle_id))) return;
  const present = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));

  if (component_scores?.length) {
    const requirements = unwrap(await supabase.from('report_requirements').select('id,max_marks').eq('is_active', true).in('id', component_scores.map((item) => item.report_requirement_id)));
    if (requirements.length !== component_scores.length) return res.status(400).json({ error: 'One or more assessment requirements are no longer active.' });
    const byId = new Map(requirements.map((item) => [item.id, item]));
    for (const component of component_scores) {
      if (component.score > Number(byId.get(component.report_requirement_id).max_marks)) {
        return res.status(400).json({ error: `Marks cannot exceed ${byId.get(component.report_requirement_id).max_marks} for this report.` });
      }
    }
    unwrap(await supabase.from('student_report_scores').upsert(component_scores.map((component) => ({
      student_id: studentId, cycle_id, report_requirement_id: component.report_requirement_id, score: component.score,
      entered_by: req.user.id, updated_at: new Date().toISOString(),
    })), { onConflict: 'student_id,cycle_id,report_requirement_id' }));
  }

  const [updated] = unwrap(
    await supabase.from('marks')
      .upsert({ student_id: studentId, cycle_id, ...present, entered_by: req.user.id }, { onConflict: 'student_id,cycle_id' })
      .select()
  );

  const assessment = await dynamicAssessment(studentId, cycle_id, track);
  res.json({ ...updated, ...assessment });
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
