import { Router } from 'express';
import { z } from 'zod';
import { supabase, unwrap } from '../db/client.js';
import { requireAuth, requireRole, scopeToDepartment } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';
import { notify } from '../lib/notifications.js';
import { closeCompetingApplications, findApprovedInternship } from '../lib/internshipExclusivity.js';
import { requireStudentPortalUnlocked } from '../lib/portalLocks.js';
import { requireVisibleCycle } from '../lib/cycleVisibility.js';

const router = Router();

async function facultyMentors() {
  const faculty = unwrap(await supabase.from('faculty').select('id,cabin').eq('mentorship_scope', 'crcs_self'));
  const ids = faculty.map((row) => row.id);
  if (!ids.length) return [];
  const [users, opportunityAssignments, selfAssignments] = await Promise.all([
    supabase.from('users').select('id,full_name,email,phone').in('id', ids).eq('is_active', true).order('full_name'),
    supabase.from('opportunity_applications').select('assigned_mentor_id').eq('status', 'crcs_approved').in('assigned_mentor_id', ids),
    supabase.from('self_internships').select('assigned_mentor_id').eq('status', 'active').in('assigned_mentor_id', ids),
  ]);
  const load = {};
  [...unwrap(opportunityAssignments), ...unwrap(selfAssignments)].forEach((row) => { if (row.assigned_mentor_id) load[row.assigned_mentor_id] = (load[row.assigned_mentor_id] ?? 0) + 1; });
  const cabinById = Object.fromEntries(faculty.map((mentor) => [mentor.id, mentor.cabin]));
  return unwrap(users)
    .filter((user) => (load[user.id] ?? 0) < 5)
    .map((user) => ({ ...user, cabin: cabinById[user.id] ?? null, active_allocations: load[user.id] ?? 0, allocation_limit: 5 }));
}

const postSchema = z.object({
  cycle_id: z.string().uuid(),
  company_name: z.string().min(1),
  company_website: z.string().url('enter a valid company website'),
  company_address: z.string().trim().min(5, 'enter the company address'),
  offer_source: z.string().trim().min(3, 'explain how you received the offer'),
});

router.post('/', requireAuth, requireRole('student'), async (req, res) => {
  const parsed = postSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!(await requireStudentPortalUnlocked(req, res))) return;
  const d = parsed.data;
  const cycle = unwrap(await supabase.from('internship_cycles').select('id,status').eq('id', d.cycle_id).maybeSingle());
  if (!cycle) return res.status(404).json({ error: 'internship cycle not found' });
  if (cycle.status !== 'open') return res.status(409).json({ error: 'this cycle is read-only until it is published as open' });
  const approvedInternship = await findApprovedInternship(req.user.id);
  if (approvedInternship) return res.status(409).json({ error: `your approved ${approvedInternship.track} already occupies your exclusive internship track` });

  const created = await supabase.from('self_internships').insert({
    student_id: req.user.id, cycle_id: d.cycle_id, company_name: d.company_name,
    company_website: d.company_website, company_address: d.company_address, offer_source: d.offer_source,
    status: 'submitted',
  }).select();
  if (created.error && /company_website|company_address|offer_source/i.test(created.error.message)) {
    return res.status(409).json({ error: 'apply migration 20260908000011_self_internship_application_details.sql before submitting a self-internship' });
  }
  const [rec] = unwrap(created);

  await logAudit({ actorId: req.user.id, actorRole: 'student', action: 'submit_self_internship', entityType: 'self_internships', entityId: rec.id, newValue: rec });

  res.status(201).json(rec);
});

router.get('/', requireAuth, async (req, res) => {
  const roles = req.user.roles.map((role) => role.role);
  if (req.query.cycle_id && !(await requireVisibleCycle(req, res, req.query.cycle_id))) return;
  let query = supabase.from('self_internships').select('*').order('created_at', { ascending: false });
  if (roles.includes('student')) query = query.eq('student_id', req.user.id);
  else if (roles.includes('faculty') && !roles.some((role) => ['crcs_superadmin', 'crcs_coordinator'].includes(role))) query = query.eq('assigned_mentor_id', req.user.id);
  if (req.query.cycle_id) query = query.eq('cycle_id', req.query.cycle_id);
  if (req.query.status) query = query.eq('status', req.query.status);
  const rows = unwrap(await query);
  const studentIds = [...new Set(rows.map((row) => row.student_id))];
  const students = studentIds.length ? unwrap(await supabase.from('users').select('id,full_name,email').in('id', studentIds)) : [];
  const mentorIds = [...new Set(rows.map((row) => row.assigned_mentor_id).filter(Boolean))];
  const [mentors, mentorProfiles] = mentorIds.length ? await Promise.all([
    supabase.from('users').select('id,full_name,email,phone').in('id', mentorIds),
    supabase.from('faculty').select('id,cabin').in('id', mentorIds),
  ]).then(([users, faculty]) => [unwrap(users), unwrap(faculty)]) : [[], []];
  const studentById = Object.fromEntries(students.map((student) => [student.id, student]));
  const cabinByMentorId = Object.fromEntries(mentorProfiles.map((mentor) => [mentor.id, mentor.cabin]));
  const mentorById = Object.fromEntries(mentors.map((mentor) => [mentor.id, { ...mentor, cabin: cabinByMentorId[mentor.id] ?? null }]));
  res.json(rows.map((row) => ({ ...row, student: studentById[row.student_id] ?? null, mentor: mentorById[row.assigned_mentor_id] ?? null })));
});

router.get('/mentor-options', requireAuth, requireRole('crcs_superadmin'), async (_req, res) => {
  res.json(await facultyMentors());
});

router.patch('/:id/withdraw', requireAuth, requireRole('student'), async (req, res) => {
  if (!(await requireStudentPortalUnlocked(req, res))) return;
  const internship = unwrap(await supabase.from('self_internships').select('*').eq('id', req.params.id).maybeSingle());
  if (!internship) return res.status(404).json({ error: 'self-internship not found' });
  if (internship.student_id !== req.user.id) return res.status(403).json({ error: 'forbidden' });
  if (!['submitted', 'mentor_approved', 'crcs_approved'].includes(internship.status)) return res.status(409).json({ error: 'only a pending self-internship can be revoked' });
  const now = new Date().toISOString();
  const [updated] = unwrap(await supabase.from('self_internships').update({ status: 'revoked', rejection_reason: 'Withdrawn by student.', updated_at: now }).eq('id', internship.id).select());
  await logAudit({ actorId: req.user.id, actorRole: 'student', action: 'withdraw_self_internship', entityType: 'self_internships', entityId: internship.id, oldValue: { status: internship.status }, newValue: { status: 'revoked', reason: 'Withdrawn by student.' } });
  res.json(updated);
});

const mentorSchema = z.object({ mentor_id: z.string().uuid() });

router.patch('/:id/mentor', requireAuth, requireRole('crcs_superadmin', 'faculty'), async (req, res) => {
  const parsed = mentorSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const internship = unwrap(await supabase.from('self_internships').select('*').eq('id', req.params.id).maybeSingle());
  if (!internship) return res.status(404).json({ error: 'self-internship not found' });
  const isFacultyOnly = !req.user.roles.some((role) => role.role === 'crcs_superadmin');
  if (isFacultyOnly && internship.assigned_mentor_id !== req.user.id) return res.status(403).json({ error: 'you can only hand off a student you currently mentor' });
  if (internship.status !== 'active') return res.status(400).json({ error: 'a faculty mentor can be allocated only after CRCS approval' });
  const mentorProfile = unwrap(await supabase.from('faculty').select('id,mentorship_scope,cabin').eq('id', parsed.data.mentor_id).maybeSingle());
  const mentor = unwrap(await supabase.from('users').select('id,full_name,email,phone,is_active').eq('id', parsed.data.mentor_id).maybeSingle());
  if (!mentor?.is_active || mentorProfile?.mentorship_scope !== 'crcs_self') return res.status(400).json({ error: 'choose an active CRCS and self-internship faculty mentor' });
  if (internship.assigned_mentor_id !== mentor.id) {
    const [opportunityAssignments, selfAssignments] = await Promise.all([
      supabase.from('opportunity_applications').select('id').eq('assigned_mentor_id', mentor.id).eq('status', 'crcs_approved'),
      supabase.from('self_internships').select('id').eq('assigned_mentor_id', mentor.id).eq('status', 'active'),
    ]);
    if (unwrap(opportunityAssignments).length + unwrap(selfAssignments).length >= 5) return res.status(409).json({ error: 'this mentor already has the maximum of 5 CRCS and self-internship students' });
  }
  const now = new Date().toISOString();
  const [updated] = unwrap(await supabase.from('self_internships').update({ assigned_mentor_id: mentor.id, mentor_assigned_at: now, mentor_assigned_by: req.user.id }).eq('id', internship.id).select());
  await notify({ userId: internship.student_id, title: 'Faculty mentor allocated', body: `${mentor.full_name} has been allocated as your faculty mentor.`, relatedEntityType: 'self_internship', relatedEntityId: internship.id });
  await logAudit({ actorId: req.user.id, actorRole: isFacultyOnly ? 'faculty' : 'crcs_superadmin', action: 'allocate_self_internship_faculty_mentor', entityType: 'self_internships', entityId: internship.id, oldValue: { assigned_mentor_id: internship.assigned_mentor_id ?? null }, newValue: { assigned_mentor_id: mentor.id } });
  res.json({ ...updated, mentor: { id: mentor.id, full_name: mentor.full_name, email: mentor.email, phone: mentor.phone, cabin: mentorProfile.cabin ?? null } });
});

const decisionSchema = z.object({ decision: z.enum(['approve', 'reject']), reason: z.string().optional() }).superRefine((value, context) => {
  if (value.decision === 'reject' && !value.reason?.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'A rejection reason is required.' });
  }
});

router.patch('/:id/mentor-decision', requireAuth, requireRole('faculty'), async (req, res) => {
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { decision, reason } = parsed.data;

  const rec = unwrap(await supabase.from('self_internships').select('*').eq('id', req.params.id).maybeSingle());
  if (!rec) return res.status(404).json({ error: 'not found' });
  if (rec.assigned_mentor_id !== req.user.id) return res.status(403).json({ error: 'not the assigned mentor' });
  if (rec.status !== 'submitted') return res.status(400).json({ error: `cannot decide from status ${rec.status}` });

  const now = new Date().toISOString();
  const [updated] = unwrap(await supabase.from('self_internships').update(decision === 'approve'
    ? { status: 'mentor_approved', mentor_decision_by: req.user.id, mentor_decision_at: now }
    : { status: 'rejected', mentor_decision_by: req.user.id, mentor_decision_at: now, rejection_reason: reason ?? null, rejected_by_role: 'faculty' }
  ).eq('id', rec.id).select());
  await notify({ userId: rec.student_id, title: `Self-internship ${decision === 'approve' ? 'approved by mentor' : 'rejected by mentor'}`, body: reason ?? null, relatedEntityType: 'self_internship', relatedEntityId: rec.id });
  await logAudit({ actorId: req.user.id, actorRole: 'faculty', action: `mentor_${decision}_self_internship`, entityType: 'self_internships', entityId: rec.id, oldValue: { status: rec.status }, newValue: { status: updated.status } });
  res.json(updated);
});

router.patch('/:id/crcs-decision', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { decision, reason } = parsed.data;

  const rec = unwrap(await supabase.from('self_internships').select('*').eq('id', req.params.id).maybeSingle());
  if (!rec) return res.status(404).json({ error: 'not found' });
  if (rec.status !== 'submitted') return res.status(400).json({ error: `cannot decide from status ${rec.status}, needs submitted` });
  if (!rec.offer_letter_doc_id) return res.status(400).json({ error: 'the student must upload the offer letter before CRCS can decide' });
  const offerLetter = unwrap(await supabase.from('documents').select('id').eq('id', rec.offer_letter_doc_id).eq('student_id', rec.student_id).eq('related_entity_type', 'self_internship').eq('related_entity_id', rec.id).maybeSingle());
  if (!offerLetter) return res.status(400).json({ error: 'the required offer letter is missing from this self-internship request' });
  if (decision === 'approve') {
    const approvedInternship = await findApprovedInternship(rec.student_id, { excludeSelfInternshipId: rec.id });
    if (approvedInternship) return res.status(409).json({ error: `student already has an approved ${approvedInternship.track}` });
  }

  const now = new Date().toISOString();
  const [updated] = unwrap(await supabase.from('self_internships').update(decision === 'approve'
    ? { status: 'active', crcs_decision_by: req.user.id, crcs_decision_at: now }
    : { status: 'rejected', crcs_decision_by: req.user.id, crcs_decision_at: now, rejection_reason: reason ?? null, rejected_by_role: 'crcs_superadmin' }
  ).eq('id', rec.id).select());
  if (decision === 'approve') await closeCompetingApplications(rec.student_id, 'self-internship', now);
  await notify({ userId: rec.student_id, title: `Self-internship ${decision === 'approve' ? 'activated by CRCS' : 'rejected by CRCS'}`, body: reason ?? null, relatedEntityType: 'self_internship', relatedEntityId: rec.id });
  await logAudit({ actorId: req.user.id, actorRole: 'crcs_superadmin', action: `crcs_${decision}_self_internship`, entityType: 'self_internships', entityId: rec.id, oldValue: { status: rec.status }, newValue: { status: updated.status } });
  res.json(updated);
});

router.get('/:id', requireAuth, async (req, res) => {
  const rec = unwrap(
    await supabase.from('self_internships').select('*, students(department_id)').eq('id', req.params.id).maybeSingle()
  );
  if (!rec) return res.status(404).json({ error: 'not found' });

  const departmentId = rec.students?.department_id;
  const isOwner = rec.student_id === req.user.id;
  const isMentor = rec.assigned_mentor_id === req.user.id;
  const roles = req.user.roles.map((r) => r.role);
  const isCrcs = roles.includes('crcs_superadmin') || roles.includes('crcs_coordinator');
  const { departmentIds, isSystemWide } = scopeToDepartment(req);
  const isScopedCoordinator = isSystemWide || (departmentIds && departmentIds.includes(departmentId));

  if (!isOwner && !isMentor && !isCrcs && !isScopedCoordinator) return res.status(403).json({ error: 'forbidden' });
  const [mentorUser, mentorProfile] = rec.assigned_mentor_id ? await Promise.all([
    supabase.from('users').select('id,full_name,email,phone').eq('id', rec.assigned_mentor_id).maybeSingle(),
    supabase.from('faculty').select('id,cabin').eq('id', rec.assigned_mentor_id).maybeSingle(),
  ]).then(([user, faculty]) => [unwrap(user), unwrap(faculty)]) : [null, null];
  const mentor = mentorUser ? { ...mentorUser, cabin: mentorProfile?.cabin ?? null } : null;
  const { students, ...rest } = rec;
  res.json({ ...rest, mentor });
});

const certSchema = z.object({ certificate_doc_id: z.string().uuid() });

router.patch('/:id/certificate', requireAuth, requireRole('student'), async (req, res) => {
  const parsed = certSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!(await requireStudentPortalUnlocked(req, res))) return;

  const rec = unwrap(await supabase.from('self_internships').select('*').eq('id', req.params.id).maybeSingle());
  if (!rec) return res.status(404).json({ error: 'not found' });
  if (rec.student_id !== req.user.id) return res.status(403).json({ error: 'forbidden' });
  if (rec.status !== 'active') return res.status(400).json({ error: `cannot upload certificate from status ${rec.status}` });

  const [updated] = unwrap(await supabase.from('self_internships').update({
    certificate_doc_id: parsed.data.certificate_doc_id, status: 'completed',
  }).eq('id', req.params.id).select());
  res.json(updated);
});

export default router;
