import { Router } from 'express';
import { z } from 'zod';
import { supabase, unwrap } from '../db/client.js';
import { requireAuth, requireRole, requireCrcsPermission } from '../middleware/auth.js';

const router = Router();

// Resolves the one internship a student is currently being mentored on, across all three
// pathways, so callers never need to already know the related_entity_type/id to ask about it.
// Also resolves the cycle so attendance can be bounded to that cycle's declared total_weeks —
// weeks are fixed when CRCS declares the cycle, not free-typed by faculty.
async function currentMentoredEntity(studentId) {
  const [research, opportunity, self] = await Promise.all([
    supabase.from('mentor_assignments').select('faculty_id,research_application_id').eq('student_id', studentId).eq('is_current', true).maybeSingle(),
    supabase.from('opportunity_applications').select('id,assigned_mentor_id,opportunity_id').eq('student_id', studentId).eq('status', 'crcs_approved').not('assigned_mentor_id', 'is', null).maybeSingle(),
    supabase.from('self_internships').select('id,assigned_mentor_id,cycle_id').eq('student_id', studentId).eq('status', 'active').not('assigned_mentor_id', 'is', null).maybeSingle(),
  ]);
  const researchRow = unwrap(research);
  if (researchRow) {
    const application = unwrap(await supabase.from('research_applications').select('project_id').eq('id', researchRow.research_application_id).maybeSingle());
    const project = application ? unwrap(await supabase.from('research_projects').select('cycle_id').eq('id', application.project_id).maybeSingle()) : null;
    return { related_entity_type: 'research_application', related_entity_id: researchRow.research_application_id, faculty_id: researchRow.faculty_id, cycle_id: project?.cycle_id ?? null };
  }
  const opportunityRow = unwrap(opportunity);
  if (opportunityRow) {
    const opportunity_ = unwrap(await supabase.from('crcs_opportunities').select('cycle_id').eq('id', opportunityRow.opportunity_id).maybeSingle());
    return { related_entity_type: 'opportunity_application', related_entity_id: opportunityRow.id, faculty_id: opportunityRow.assigned_mentor_id, cycle_id: opportunity_?.cycle_id ?? null };
  }
  const selfRow = unwrap(self);
  if (selfRow) return { related_entity_type: 'self_internship', related_entity_id: selfRow.id, faculty_id: selfRow.assigned_mentor_id, cycle_id: selfRow.cycle_id ?? null };
  return null;
}

async function totalWeeksFor(cycleId) {
  if (!cycleId) return 16;
  const cycle = unwrap(await supabase.from('internship_cycles').select('total_weeks').eq('id', cycleId).maybeSingle());
  return cycle?.total_weeks ?? 16;
}

async function mentoredEntitiesForCycle(cycleId) {
  const [researchAssignmentsResult, opportunityApplicationsResult, selfInternshipsResult] = await Promise.all([
    supabase.from('mentor_assignments').select('student_id,faculty_id,research_application_id').eq('is_current', true),
    supabase.from('opportunity_applications').select('id,student_id,assigned_mentor_id,opportunity_id').eq('status', 'crcs_approved').not('assigned_mentor_id', 'is', null),
    supabase.from('self_internships').select('id,student_id,assigned_mentor_id').eq('cycle_id', cycleId).eq('status', 'active').not('assigned_mentor_id', 'is', null),
  ]);
  const researchAssignments = unwrap(researchAssignmentsResult);
  const opportunityApplications = unwrap(opportunityApplicationsResult);
  const selfInternships = unwrap(selfInternshipsResult);
  const researchApplicationIds = researchAssignments.map((assignment) => assignment.research_application_id);
  const opportunityIds = opportunityApplications.map((application) => application.opportunity_id);
  const researchApplicationsResult = researchApplicationIds.length
    ? await supabase.from('research_applications').select('id,project_id').in('id', researchApplicationIds)
    : { data: [], error: null };
  const researchApplications = unwrap(researchApplicationsResult);
  const researchProjectIds = researchApplications.map((application) => application.project_id);
  const [projectsResult, opportunitiesResult] = await Promise.all([
    researchProjectIds.length ? supabase.from('research_projects').select('id,cycle_id').in('id', researchProjectIds) : { data: [], error: null },
    opportunityIds.length ? supabase.from('crcs_opportunities').select('id,cycle_id').in('id', opportunityIds) : { data: [], error: null },
  ]);
  const projects = unwrap(projectsResult);
  const opportunities = unwrap(opportunitiesResult);
  const applicationById = Object.fromEntries(researchApplications.map((application) => [application.id, application]));
  const projectById = Object.fromEntries(projects.map((project) => [project.id, project]));
  const opportunityById = Object.fromEntries(opportunities.map((opportunity) => [opportunity.id, opportunity]));
  const entities = new Map();
  researchAssignments.forEach((assignment) => {
    const application = applicationById[assignment.research_application_id];
    if (application && projectById[application.project_id]?.cycle_id === cycleId) entities.set(assignment.student_id, { related_entity_type: 'research_application', related_entity_id: assignment.research_application_id });
  });
  opportunityApplications.forEach((application) => {
    if (!entities.has(application.student_id) && opportunityById[application.opportunity_id]?.cycle_id === cycleId) entities.set(application.student_id, { related_entity_type: 'opportunity_application', related_entity_id: application.id });
  });
  selfInternships.forEach((internship) => {
    if (!entities.has(internship.student_id)) entities.set(internship.student_id, { related_entity_type: 'self_internship', related_entity_id: internship.id });
  });
  return entities;
}

// The CRCS marks overview needs every attendance value for a cycle. Returning
// them together keeps that page consistent with its selected cycle and avoids
// one `/attendance/:student_id` request for every visible student.
router.get('/attendance', requireAuth, requireRole('crcs_superadmin', 'crcs_coordinator'), requireCrcsPermission('view_marks'), async (req, res) => {
  const parsed = z.object({ cycle_id: z.string().uuid() }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'cycle_id must be a UUID' });
  const cycle = unwrap(await supabase.from('internship_cycles').select('id,total_weeks').eq('id', parsed.data.cycle_id).maybeSingle());
  if (!cycle) return res.status(404).json({ error: 'internship cycle not found' });
  const entities = await mentoredEntitiesForCycle(cycle.id);
  const studentIds = [...entities.keys()];
  const rows = studentIds.length ? unwrap(await supabase.from('weekly_attendance').select('student_id,related_entity_type,related_entity_id,present').in('student_id', studentIds)) : [];
  const attendance = {};
  entities.forEach((entity, studentId) => {
    const weeks = rows.filter((row) => row.student_id === studentId && row.related_entity_type === entity.related_entity_type && row.related_entity_id === entity.related_entity_id);
    const present_count = weeks.filter((week) => week.present).length;
    attendance[studentId] = { ...entity, present_count, total_count: weeks.length, total_weeks: cycle.total_weeks ?? 16, percentage: cycle.total_weeks ? Math.round((present_count / cycle.total_weeks) * 100) : null };
  });
  res.json({ cycle_id: cycle.id, attendance });
});

router.get('/attendance/:student_id', requireAuth, async (req, res) => {
  const studentId = req.params.student_id;
  const isSelf = req.user.id === studentId;
  const roles = req.user.roles.map((role) => role.role);
  const isOversight = roles.some((role) => ['crcs_superadmin', 'crcs_coordinator', 'hod', 'dean', 'faculty_coordinator'].includes(role));
  const entity = await currentMentoredEntity(studentId);
  if (!isSelf && !isOversight && (!entity || entity.faculty_id !== req.user.id)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  if (!entity) return res.json({ weeks: [], present_count: 0, total_count: 0, total_weeks: 16, percentage: null, related_entity_type: null, related_entity_id: null });
  const [weeks, totalWeeks] = await Promise.all([
    supabase.from('weekly_attendance').select('week_number,present').eq('student_id', studentId).eq('related_entity_type', entity.related_entity_type).eq('related_entity_id', entity.related_entity_id).order('week_number').then(unwrap),
    totalWeeksFor(entity.cycle_id),
  ]);
  const presentCount = weeks.filter((week) => week.present).length;
  res.json({
    weeks, present_count: presentCount, total_count: weeks.length, total_weeks: totalWeeks,
    percentage: totalWeeks ? Math.round((presentCount / totalWeeks) * 100) : null,
    related_entity_type: entity.related_entity_type, related_entity_id: entity.related_entity_id,
  });
});

const putSchema = z.object({
  student_id: z.string().uuid(),
  related_entity_type: z.enum(['research_application', 'opportunity_application', 'self_internship']),
  related_entity_id: z.string().uuid(),
  week_number: z.coerce.number().int().min(1),
  present: z.boolean(),
});

router.put('/attendance', requireAuth, requireRole('faculty'), async (req, res) => {
  const parsed = putSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { student_id, related_entity_type, related_entity_id, week_number, present } = parsed.data;
  const entity = await currentMentoredEntity(student_id);
  if (!entity || entity.faculty_id !== req.user.id || entity.related_entity_type !== related_entity_type || entity.related_entity_id !== related_entity_id) {
    return res.status(403).json({ error: 'not the current mentor for this student' });
  }
  const totalWeeks = await totalWeeksFor(entity.cycle_id);
  if (week_number > totalWeeks) return res.status(400).json({ error: `this cycle only runs for ${totalWeeks} weeks` });
  const [row] = unwrap(await supabase.from('weekly_attendance').upsert({
    student_id, faculty_id: req.user.id, related_entity_type, related_entity_id, week_number, present, marked_by: req.user.id, marked_at: new Date().toISOString(),
  }, { onConflict: 'student_id,related_entity_type,related_entity_id,week_number' }).select());
  res.json(row);
});

export default router;
