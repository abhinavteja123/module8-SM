import { Router } from 'express';
import { z } from 'zod';
import { supabase, unwrap } from '../db/client.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';
import { notify } from '../lib/notifications.js';
import { requireFacultyAssignmentsUnlocked } from '../lib/portalLocks.js';

const router = Router();
const deadlineSchema = z.object({
  student_id: z.string().uuid(),
  related_entity_type: z.enum(['research_application', 'opportunity_application', 'self_internship']),
  related_entity_id: z.string().uuid(),
  report_template_id: z.string().uuid().optional(),
  title: z.string().min(1),
  due_at: z.string().datetime(),
});

const keyFor = (studentId, type, id) => `${studentId}:${type}:${id}`;

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

router.get('/my', requireAuth, requireRole('student'), async (req, res) => {
  const result = await supabase.from('report_deadlines').select('*').eq('student_id', req.user.id).order('due_at');
  if (result.error && /report_deadlines/i.test(result.error.message)) return res.status(409).json({ error: 'apply report deadline migrations before using mentor deadlines' });
  res.json(await withDetails(unwrap(result)));
});

router.get('/assigned', requireAuth, requireRole('faculty'), async (req, res) => {
  const records = await currentMentorRecords(req.user.id);
  if (!records.length) return res.json([]);
  const result = await supabase.from('report_deadlines').select('*').in('student_id', [...new Set(records.map((record) => record.student_id))]).order('due_at');
  if (result.error && /report_deadlines/i.test(result.error.message)) return res.status(409).json({ error: 'apply report deadline migrations before using mentor deadlines' });
  const allowed = new Set(records.map((record) => keyFor(record.student_id, record.related_entity_type, record.related_entity_id)));
  res.json(await withDetails(unwrap(result).filter((deadline) => allowed.has(keyFor(deadline.student_id, deadline.related_entity_type, deadline.related_entity_id)))));
});

router.post('/', requireAuth, requireRole('faculty'), async (req, res) => {
  const parsed = deadlineSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!(await requireFacultyAssignmentsUnlocked(req.user.id, res))) return;
  const deadline = parsed.data;
  if (new Date(deadline.due_at) <= new Date()) return res.status(400).json({ error: 'the deadline must be in the future' });
  if (!(await hasCurrentMentorAssignment(deadline.student_id, deadline.related_entity_type, deadline.related_entity_id, req.user.id))) return res.status(403).json({ error: 'you may only set deadlines for students currently allocated to you' });
  const payload = { ...deadline, report_template_id: deadline.report_template_id ?? null, assigned_by: req.user.id, research_application_id: deadline.related_entity_type === 'research_application' ? deadline.related_entity_id : null };
  const result = await supabase.from('report_deadlines').insert(payload).select();
  if (result.error && /related_entity|report_deadlines/i.test(result.error.message)) return res.status(409).json({ error: 'apply migration 20260908000010_all_internship_report_deadlines.sql before using this deadline workflow' });
  const [created] = unwrap(result);
  await notify({ userId: created.student_id, title: `New report deadline: ${created.title}`, body: `Your mentor set the deadline for ${new Date(created.due_at).toLocaleString()}.`, relatedEntityType: 'report_deadline', relatedEntityId: created.id });
  await logAudit({ actorId: req.user.id, actorRole: 'faculty', action: 'set_report_deadline', entityType: 'report_deadlines', entityId: created.id, newValue: created });
  res.status(201).json((await withDetails([created]))[0]);
});

export default router;
