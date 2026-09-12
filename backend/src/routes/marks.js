import { Router } from 'express';
import { z } from 'zod';
import { supabase, unwrap } from '../db/client.js';
import { requireAuth, requireRole, requireCrcsPermission, scopeToDepartment } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';
import { requireFacultyMarksUnlocked } from '../lib/portalLocks.js';
import { requireVisibleCycle } from '../lib/cycleVisibility.js';
import { readAllRows } from '../lib/directoryPage.js';

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
  const graded = components.filter((item) => item.is_assessed);
  return { requirements: components, total: graded.reduce((sum, item) => sum + (Number(item.score) || 0), 0), maximum: graded.reduce((sum, item) => sum + Number(item.max_marks || 0), 0) };
}

async function cycleEnrollment(studentId, cycleId) {
  return unwrap(await supabase.from('cycle_participants').select('user_id').eq('cycle_id', cycleId).eq('user_id', studentId).maybeSingle());
}

// A mentor may only work on the active entity in the requested cycle. This
// prevents a historical/current assignment in another cycle authorizing marks.
async function currentMentoredEntityForCycle(studentId, facultyId, cycleId) {
  const [research, opportunity, self] = await Promise.all([
    supabase.from('mentor_assignments').select('research_application_id').eq('student_id', studentId).eq('faculty_id', facultyId).eq('is_current', true),
    supabase.from('opportunity_applications').select('id,opportunity_id').eq('student_id', studentId).eq('assigned_mentor_id', facultyId).eq('status', 'crcs_approved'),
    supabase.from('self_internships').select('id').eq('student_id', studentId).eq('assigned_mentor_id', facultyId).eq('cycle_id', cycleId).eq('status', 'active'),
  ]);
  const researchIds = unwrap(research).map((row) => row.research_application_id);
  if (researchIds.length) {
    const apps = unwrap(await supabase.from('research_applications').select('id,project_id').in('id', researchIds));
    const projectIds = apps.map((row) => row.project_id);
    const projects = projectIds.length ? unwrap(await supabase.from('research_projects').select('id').in('id', projectIds).eq('cycle_id', cycleId)) : [];
    const projectSet = new Set(projects.map((row) => row.id));
    if (apps.some((row) => projectSet.has(row.project_id))) return 'research';
  }
  const opportunityRows = unwrap(opportunity);
  if (opportunityRows.length) {
    const offers = unwrap(await supabase.from('crcs_opportunities').select('id').in('id', opportunityRows.map((row) => row.opportunity_id)).eq('cycle_id', cycleId));
    if (offers.length) return 'crcs_opportunity';
  }
  return unwrap(self).length ? 'self_internship' : null;
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
  if (req.user.id === studentId) return true;
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
  const parsed = z.object({ cycle_id: z.string().uuid(), page: z.coerce.number().int().min(1).optional(), page_size: z.coerce.number().int().min(1).max(200).optional(), search: z.string().trim().max(120).optional() }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'cycle_id must be a UUID' });
  const { cycle_id, page, page_size, search } = parsed.data;
  if (!(await requireVisibleCycle(req, res, cycle_id, { mode: 'read' }))) return;
  const participants = await readAllRows(() => supabase.from('cycle_participants').select('user_id, users!inner(id,full_name,email)').eq('cycle_id', cycle_id).eq('participant_type', 'student').order('user_id'));
  let students = participants.map((row) => ({ id: row.user_id, ...(row.users ?? {}) }));
  if (search) { const needle = search.toLowerCase(); students = students.filter((student) => `${student.full_name ?? ''} ${student.email ?? ''}`.toLowerCase().includes(needle)); }
  const total = students.length;
  const selected = page ? students.slice((page - 1) * (page_size ?? 50), page * (page_size ?? 50)) : students;
  const studentIds = selected.map((student) => student.id);
  const rows = studentIds.length ? unwrap(await supabase.from('marks').select('*').eq('cycle_id', cycle_id).in('student_id', studentIds)) : [];
  const requirements = unwrap(await supabase.from('report_requirements').select('*').eq('is_active', true).order('sort_order').order('created_at'));
  const scores = studentIds.length && requirements.length ? unwrap(await supabase.from('student_report_scores').select('*').eq('cycle_id', cycle_id).in('student_id', studentIds).in('report_requirement_id', requirements.map((item) => item.id))) : [];
  const byMark = new Map(rows.map((row) => [row.student_id, row]));
  const scoresByStudent = new Map();
  scores.forEach((score) => { const list = scoresByStudent.get(score.student_id) ?? []; list.push(score); scoresByStudent.set(score.student_id, list); });
  const items = selected.map((student) => {
    const scoreByRequirement = new Map((scoresByStudent.get(student.id) ?? []).map((score) => [score.report_requirement_id, score]));
    const components = requirements.map((requirement) => ({ ...requirement, score: scoreByRequirement.get(requirement.id)?.score ?? null }));
    const assessed = components.filter((component) => component.is_assessed);
    return { student_id: student.id, student, ...(byMark.get(student.id) ?? {}), assessment: { requirements: components, total: assessed.reduce((sum, component) => sum + (Number(component.score) || 0), 0), maximum: assessed.reduce((sum, component) => sum + Number(component.max_marks || 0), 0) } };
  });
  res.json(page ? { items, total, page, page_size: page_size ?? 50, requirements } : items);
});

router.get('/:student_id', requireAuth, async (req, res) => {
  if (!(await canView(req, req.params.student_id))) return res.status(403).json({ error: 'forbidden' });
  const { cycle_id } = req.query;
  if (cycle_id) {
    if (!(await requireVisibleCycle(req, res, cycle_id, { mode: 'read' }))) return;
    if (!(await cycleEnrollment(req.params.student_id, cycle_id))) return res.status(404).json({ error: 'student is not enrolled in this cycle' });
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

  const { cycle_id, component_scores, track, ...fields } = parsed.data;
  if (!(await requireVisibleCycle(req, res, cycle_id, { mode: 'write' }))) return;
  if (!(await cycleEnrollment(studentId, cycle_id))) return res.status(403).json({ error: 'student is not enrolled in this cycle' });
  const actualTrack = await currentMentoredEntityForCycle(studentId, req.user.id, cycle_id);
  if (!actualTrack) return res.status(403).json({ error: 'not the current mentor for this student in this cycle' });
  if (track && track !== actualTrack) return res.status(400).json({ error: 'track does not match the student\'s active internship pathway' });
  const present = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));

  if (component_scores?.length) {
    const requirements = unwrap(await supabase.from('report_requirements').select('id,max_marks,track').eq('is_active', true).in('id', component_scores.map((item) => item.report_requirement_id)));
    if (requirements.length !== component_scores.length) return res.status(400).json({ error: 'One or more assessment requirements are no longer active.' });
    if (requirements.some((requirement) => requirement.track && requirement.track !== actualTrack)) return res.status(400).json({ error: 'A submitted assessment does not apply to this internship pathway.' });
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

  const assessment = await dynamicAssessment(studentId, cycle_id, actualTrack);
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
  if (!(await requireVisibleCycle(req, res, cycle_id, { mode: 'write' }))) return;
  if (!(await cycleEnrollment(studentId, cycle_id))) return res.status(404).json({ error: 'student is not enrolled in this cycle' });

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
