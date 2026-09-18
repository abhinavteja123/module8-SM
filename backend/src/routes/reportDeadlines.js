import { Router } from 'express';
import { z } from 'zod';
import { supabase, unwrap } from '../db/client.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';
import { notify } from '../lib/notifications.js';
import { requireFacultyAssignmentsUnlocked } from '../lib/portalLocks.js';
import { requireVisibleCycle } from '../lib/cycleVisibility.js';

const router = Router();
const deadlineSchema = z.object({
  cycle_id: z.string().uuid(),
  student_id: z.string().uuid(),
  related_entity_type: z.enum(['research_application', 'opportunity_application', 'self_internship']),
  related_entity_id: z.string().uuid(),
  report_template_id: z.string().uuid().optional(),
  title: z.string().min(1),
  due_at: z.string().datetime(),
});

const keyFor = (studentId, type, id) => `${studentId}:${type}:${id}`;
const TRACK_BY_TYPE = { research_application: 'research', opportunity_application: 'crcs_opportunity', self_internship: 'self_internship' };

const universalSchema = z.object({
  cycle_id: z.string().uuid(),
  report_template_id: z.string().uuid(),
  title: z.string().min(1),
  due_at: z.string().datetime(),
});

// A CRCS default only applies to a student's record if its report template
// isn't restricted to a different internship track.
function appliesToTrack(universal, type) {
  const track = universal.report_templates?.track ?? null;
  return !track || track === TRACK_BY_TYPE[type];
}

// Merges cycle-wide CRCS defaults under a student's own per-record deadlines,
// so a faculty override always wins and every other report still shows a date.
function withUniversalFallback(overrides, records, universalRows, studentIdFor) {
  const extra = [];
  for (const record of records) {
    for (const universal of universalRows) {
      if (!appliesToTrack(universal, record.related_entity_type)) continue;
      const studentId = studentIdFor(record);
      const hasOverride = overrides.some((row) => row.student_id === studentId && row.related_entity_type === record.related_entity_type && row.related_entity_id === record.related_entity_id && row.report_template_id === universal.report_template_id);
      if (!hasOverride) extra.push({ ...universal, student_id: studentId, related_entity_type: record.related_entity_type, related_entity_id: record.related_entity_id, is_universal: true });
    }
  }
  return [...overrides, ...extra];
}

async function withDetails(deadlines) {
  const studentIds = [...new Set(deadlines.map((deadline) => deadline.student_id))];
  const templateIds = [...new Set(deadlines.map((deadline) => deadline.report_template_id).filter(Boolean))];
  const [students, templates] = await Promise.all([
    studentIds.length ? supabase.from('users').select('id,full_name,email').in('id', studentIds) : { data: [] },
    templateIds.length ? supabase.from('report_templates').select('id,name').in('id', templateIds) : { data: [] },
  ]);
  const studentById = Object.fromEntries(unwrap(students).map((student) => [student.id, student]));
  const templateById = Object.fromEntries(unwrap(templates).map((template) => [template.id, template]));
  return deadlines.map((deadline) => ({ ...deadline, student: studentById[deadline.student_id] ?? null, template: templateById[deadline.report_template_id] ?? null }));
}

async function hasCurrentMentorAssignment(studentId, type, relatedId, facultyId) {
  if (type === 'research_application') {
    return Boolean(unwrap(await supabase.from('mentor_assignments').select('id').eq('faculty_id', facultyId).eq('student_id', studentId).eq('research_application_id', relatedId).eq('is_current', true).maybeSingle()));
  }
  if (type === 'opportunity_application') {
    return Boolean(unwrap(await supabase.from('opportunity_applications').select('id').eq('id', relatedId).eq('student_id', studentId).eq('assigned_mentor_id', facultyId).eq('status', 'crcs_approved').maybeSingle()));
  }
  return Boolean(unwrap(await supabase.from('self_internships').select('id').eq('id', relatedId).eq('student_id', studentId).eq('assigned_mentor_id', facultyId).eq('status', 'active').maybeSingle()));
}

async function entityBelongsToCycle(type, relatedId, cycleId) {
  if (type === 'self_internship') return Boolean(unwrap(await supabase.from('self_internships').select('id').eq('id', relatedId).eq('cycle_id', cycleId).maybeSingle()));
  if (type === 'opportunity_application') {
    const application = unwrap(await supabase.from('opportunity_applications').select('opportunity_id').eq('id', relatedId).maybeSingle());
    return Boolean(application && unwrap(await supabase.from('crcs_opportunities').select('id').eq('id', application.opportunity_id).eq('cycle_id', cycleId).maybeSingle()));
  }
  const application = unwrap(await supabase.from('research_applications').select('project_id').eq('id', relatedId).maybeSingle());
  return Boolean(application && unwrap(await supabase.from('research_projects').select('id').eq('id', application.project_id).eq('cycle_id', cycleId).maybeSingle()));
}

async function currentMentorRecords(facultyId) {
  const [research, opportunities, selfInternships] = await Promise.all([
    supabase.from('mentor_assignments').select('student_id,research_application_id').eq('faculty_id', facultyId).eq('is_current', true),
    supabase.from('opportunity_applications').select('id,student_id').eq('assigned_mentor_id', facultyId).eq('status', 'crcs_approved'),
    supabase.from('self_internships').select('id,student_id').eq('assigned_mentor_id', facultyId).eq('status', 'active'),
  ]);
  return [
    ...unwrap(research).map((row) => ({ student_id: row.student_id, related_entity_type: 'research_application', related_entity_id: row.research_application_id })),
    ...unwrap(opportunities).map((row) => ({ student_id: row.student_id, related_entity_type: 'opportunity_application', related_entity_id: row.id })),
    ...unwrap(selfInternships).map((row) => ({ student_id: row.student_id, related_entity_type: 'self_internship', related_entity_id: row.id })),
  ];
}

async function currentStudentRecords(studentId) {
  const [research, opportunities, selfInternships] = await Promise.all([
    supabase.from('research_applications').select('id').eq('student_id', studentId).eq('status', 'crcs_approved'),
    supabase.from('opportunity_applications').select('id').eq('student_id', studentId).eq('status', 'crcs_approved'),
    supabase.from('self_internships').select('id').eq('student_id', studentId).eq('status', 'active'),
  ]);
  return [
    ...unwrap(research).map((row) => ({ related_entity_type: 'research_application', related_entity_id: row.id })),
    ...unwrap(opportunities).map((row) => ({ related_entity_type: 'opportunity_application', related_entity_id: row.id })),
    ...unwrap(selfInternships).map((row) => ({ related_entity_type: 'self_internship', related_entity_id: row.id })),
  ];
}

async function recordsForCycle(records, cycleId) {
  const researchIds = records.filter((row) => row.related_entity_type === 'research_application').map((row) => row.related_entity_id);
  const opportunityIds = records.filter((row) => row.related_entity_type === 'opportunity_application').map((row) => row.related_entity_id);
  const selfIds = records.filter((row) => row.related_entity_type === 'self_internship').map((row) => row.related_entity_id);
  const [researchApps, opportunityApps, self] = await Promise.all([
    researchIds.length ? supabase.from('research_applications').select('id,project_id').in('id', researchIds) : { data: [], error: null },
    opportunityIds.length ? supabase.from('opportunity_applications').select('id,opportunity_id').in('id', opportunityIds) : { data: [], error: null },
    selfIds.length ? supabase.from('self_internships').select('id').in('id', selfIds).eq('cycle_id', cycleId) : { data: [], error: null },
  ]);
  const projectIds = unwrap(researchApps).map((row) => row.project_id);
  const opportunityIdsForApps = unwrap(opportunityApps).map((row) => row.opportunity_id);
  const [projects, opportunities] = await Promise.all([
    projectIds.length ? supabase.from('research_projects').select('id').in('id', projectIds).eq('cycle_id', cycleId) : { data: [], error: null },
    opportunityIdsForApps.length ? supabase.from('crcs_opportunities').select('id').in('id', opportunityIdsForApps).eq('cycle_id', cycleId) : { data: [], error: null },
  ]);
  const projectSet = new Set(unwrap(projects).map((row) => row.id));
  const opportunitySet = new Set(unwrap(opportunities).map((row) => row.id));
  const allowed = new Set([
    ...unwrap(researchApps).filter((row) => projectSet.has(row.project_id)).map((row) => `research_application:${row.id}`),
    ...unwrap(opportunityApps).filter((row) => opportunitySet.has(row.opportunity_id)).map((row) => `opportunity_application:${row.id}`),
    ...unwrap(self).map((row) => `self_internship:${row.id}`),
  ]);
  return records.filter((row) => allowed.has(`${row.related_entity_type}:${row.related_entity_id}`));
}

async function universalRowsForCycle(cycleId) {
  return unwrap(await supabase.from('report_deadlines').select('*, report_templates(track)').is('student_id', null).eq('cycle_id', cycleId));
}

router.get('/my', requireAuth, requireRole('student'), async (req, res) => {
  const parsed = z.object({ cycle_id: z.string().uuid() }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'cycle_id must be a UUID' });
  const { cycle_id } = parsed.data;
  if (!(await requireVisibleCycle(req, res, cycle_id, { mode: 'read' }))) return;
  const result = await supabase.from('report_deadlines').select('*').eq('student_id', req.user.id).order('due_at');
  if (result.error && /report_deadlines/i.test(result.error.message)) return res.status(409).json({ error: 'apply report deadline migrations before using mentor deadlines' });
  const records = await recordsForCycle(unwrap(result).map((row) => ({ student_id: row.student_id, related_entity_type: row.related_entity_type, related_entity_id: row.related_entity_id })), cycle_id);
  const allowed = new Set(records.map((row) => keyFor(row.student_id, row.related_entity_type, row.related_entity_id)));
  const overrides = unwrap(result).filter((row) => allowed.has(keyFor(row.student_id, row.related_entity_type, row.related_entity_id)));
  const myRecords = await recordsForCycle(await currentStudentRecords(req.user.id), cycle_id);
  const universalRows = await universalRowsForCycle(cycle_id);
  const merged = withUniversalFallback(overrides, myRecords, universalRows, () => req.user.id);
  res.json(await withDetails(merged));
});

router.get('/assigned', requireAuth, requireRole('faculty'), async (req, res) => {
  const parsed = z.object({ cycle_id: z.string().uuid() }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'cycle_id must be a UUID' });
  const { cycle_id } = parsed.data;
  if (!(await requireVisibleCycle(req, res, cycle_id, { mode: 'read' }))) return;
  const records = await recordsForCycle(await currentMentorRecords(req.user.id), cycle_id);
  if (!records.length) return res.json([]);
  const result = await supabase.from('report_deadlines').select('*').in('student_id', [...new Set(records.map((record) => record.student_id))]).order('due_at');
  if (result.error && /report_deadlines/i.test(result.error.message)) return res.status(409).json({ error: 'apply report deadline migrations before using mentor deadlines' });
  const allowed = new Set(records.map((record) => keyFor(record.student_id, record.related_entity_type, record.related_entity_id)));
  const overrides = unwrap(result).filter((deadline) => allowed.has(keyFor(deadline.student_id, deadline.related_entity_type, deadline.related_entity_id)));
  const universalRows = await universalRowsForCycle(cycle_id);
  const merged = withUniversalFallback(overrides, records, universalRows, (record) => record.student_id);
  res.json(await withDetails(merged));
});

router.get('/universal', requireAuth, requireRole('crcs_superadmin', 'faculty'), async (req, res) => {
  const parsed = z.object({ cycle_id: z.string().uuid() }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'cycle_id must be a UUID' });
  if (!(await requireVisibleCycle(req, res, parsed.data.cycle_id, { mode: 'read' }))) return;
  const rows = unwrap(await supabase.from('report_deadlines').select('*').is('student_id', null).eq('cycle_id', parsed.data.cycle_id).order('due_at'));
  res.json(rows);
});

router.post('/universal', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const parsed = universalSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const value = parsed.data;
  if (new Date(value.due_at) <= new Date()) return res.status(400).json({ error: 'the deadline must be in the future' });
  if (!(await requireVisibleCycle(req, res, value.cycle_id, { mode: 'write' }))) return;
  const template = unwrap(await supabase.from('report_templates').select('id').eq('id', value.report_template_id).eq('university_id', req.user.university_id).maybeSingle());
  if (!template) return res.status(404).json({ error: 'report type not found' });
  const existing = unwrap(await supabase.from('report_deadlines').select('id').is('student_id', null).eq('cycle_id', value.cycle_id).eq('report_template_id', value.report_template_id).maybeSingle());
  const payload = { cycle_id: value.cycle_id, report_template_id: value.report_template_id, title: value.title, due_at: value.due_at, assigned_by: req.user.id, student_id: null, related_entity_type: null, related_entity_id: null };
  const result = existing
    ? await supabase.from('report_deadlines').update(payload).eq('id', existing.id).select()
    : await supabase.from('report_deadlines').insert(payload).select();
  if (result.error && /report_deadlines|cycle_id/i.test(result.error.message)) return res.status(409).json({ error: 'apply migration 20260915000045_universal_report_deadlines.sql before setting a cycle-wide deadline' });
  const [created] = unwrap(result);
  await logAudit({ actorId: req.user.id, actorRole: 'crcs_superadmin', action: existing ? 'update_universal_report_deadline' : 'set_universal_report_deadline', entityType: 'report_deadlines', entityId: created.id, newValue: created });
  res.status(existing ? 200 : 201).json(created);
});

router.post('/', requireAuth, requireRole('faculty'), async (req, res) => {
  const parsed = deadlineSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!(await requireFacultyAssignmentsUnlocked(req.user.id, res))) return;
  const deadline = parsed.data;
  if (!(await requireVisibleCycle(req, res, deadline.cycle_id, { mode: 'write' }))) return;
  if (new Date(deadline.due_at) <= new Date()) return res.status(400).json({ error: 'the deadline must be in the future' });
  if (!(await hasCurrentMentorAssignment(deadline.student_id, deadline.related_entity_type, deadline.related_entity_id, req.user.id))) return res.status(403).json({ error: 'you may only set deadlines for students currently allocated to you' });
  if (!(await entityBelongsToCycle(deadline.related_entity_type, deadline.related_entity_id, deadline.cycle_id))) return res.status(400).json({ error: 'the selected internship record is outside this cycle' });
  const { cycle_id, ...deadlineFields } = deadline;
  const payload = { ...deadlineFields, report_template_id: deadline.report_template_id ?? null, assigned_by: req.user.id, research_application_id: deadline.related_entity_type === 'research_application' ? deadline.related_entity_id : null };
  const result = await supabase.from('report_deadlines').insert(payload).select();
  if (result.error && /related_entity|report_deadlines/i.test(result.error.message)) return res.status(409).json({ error: 'apply migration 20260908000010_all_internship_report_deadlines.sql before using this deadline workflow' });
  const [created] = unwrap(result);
  await notify({ userId: created.student_id, title: `New report deadline: ${created.title}`, body: `Your mentor set the deadline for ${new Date(created.due_at).toLocaleString()}.`, relatedEntityType: 'report_deadline', relatedEntityId: created.id });
  await logAudit({ actorId: req.user.id, actorRole: 'faculty', action: 'set_report_deadline', entityType: 'report_deadlines', entityId: created.id, newValue: created });
  res.status(201).json((await withDetails([created]))[0]);
});

export default router;
