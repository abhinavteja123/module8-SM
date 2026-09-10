import { Router } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { z } from 'zod';
import { supabase, unwrap } from '../db/client.js';
import { requireAuth, requireRole, requireCrcsPermission } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';
import { notify } from '../lib/notifications.js';
import { getSignedUrl } from '../lib/storage.js';
import { closeCompetingApplications, findApprovedInternship } from '../lib/internshipExclusivity.js';
import { requireStudentPortalUnlocked } from '../lib/portalLocks.js';
import { requireVisibleCycle } from '../lib/cycleVisibility.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

function deadlineHasPassed(deadline) {
  if (!deadline) return false;
  // Date-only deadlines stay open for their entire calendar day.
  const date = String(deadline).slice(0, 10);
  return new Date(`${date}T23:59:59.999Z`).getTime() < Date.now();
}

function applicationAvailability(opportunity) {
  if (opportunity.is_active === false) return 'archived';
  if (opportunity.accepting_applications === false) return 'closed';
  if (deadlineHasPassed(opportunity.application_deadline)) return 'expired';
  return 'open';
}

function withApplicationAvailability(opportunity) {
  return { ...opportunity, accepting_applications: opportunity.accepting_applications !== false, application_status: applicationAvailability(opportunity) };
}

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

router.get('/', requireAuth, async (req, res) => {
  if (req.query.cycle_id && !(await requireVisibleCycle(req, res, req.query.cycle_id))) return;
  let query = supabase.from('crcs_opportunities').select('*').order('created_at', { ascending: false });
  if (req.query.cycle_id) query = query.eq('cycle_id', req.query.cycle_id);
  const rows = unwrap(await query);
  res.json(rows.filter((row) => row.is_active !== false).map(withApplicationAvailability));
});

const opportunityFields = z.object({
  cycle_id: z.string().uuid(),
  title: z.string().min(1),
  organization_name: z.string().min(1),
  description: z.string().optional(),
  eligibility: z.string().optional(),
  eligible_department_ids: z.array(z.string().uuid()).max(100).optional(),
  minimum_cgpa: z.coerce.number().min(0, 'CGPA cannot be below 0').max(10, 'CGPA cannot be above 10').optional(),
  application_deadline: z.string().optional(),
  application_url: z.string().url('must be a valid URL').optional().or(z.literal('')),
  opportunity_type: z.enum(['exclusive', 'open_source']).default('exclusive'),
  accepting_applications: z.boolean().optional(),
});
const postSchema = opportunityFields.superRefine((value, context) => {
  if (value.opportunity_type === 'open_source' && !value.application_url) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['application_url'], message: 'An open-source opportunity needs the company application link.' });
  }
});
const applicationSchema = z.object({ application_answers: z.record(z.any()).optional() });

const patchSchema = opportunityFields.omit({ cycle_id: true }).partial().refine((value) => Object.keys(value).length > 0, { message: 'provide at least one field to update' });

async function writeOpportunity(payload, id = null) {
  const request = id
    ? supabase.from('crcs_opportunities').update(payload).eq('id', id).select()
    : supabase.from('crcs_opportunities').insert(payload).select();
  let result = await request;
  // The optional enhancements are deployed through the checked-in migration.
  // Keep older connected environments usable while that migration is pending.
  if (result.error && /application_url|opportunity_type|is_active|minimum_cgpa|eligible_department_ids|accepting_applications/.test(result.error.message)) {
    const legacyPayload = { ...payload };
    delete legacyPayload.application_url;
    delete legacyPayload.opportunity_type;
    delete legacyPayload.is_active;
    delete legacyPayload.minimum_cgpa;
    delete legacyPayload.eligible_department_ids;
    delete legacyPayload.accepting_applications;
    result = id
      ? await supabase.from('crcs_opportunities').update(legacyPayload).eq('id', id).select()
      : await supabase.from('crcs_opportunities').insert(legacyPayload).select();
  }
  return unwrap(result);
}

router.post('/', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const parsed = postSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;
  if (d.eligible_department_ids?.length) {
    const departments = unwrap(await supabase.from('departments').select('id').in('id', d.eligible_department_ids));
    if (departments.length !== d.eligible_department_ids.length) return res.status(400).json({ error: 'Select only existing departments.' });
  }
  const cycle = unwrap(await supabase.from('internship_cycles').select('id,status').eq('id', d.cycle_id).maybeSingle());
  if (!cycle) return res.status(404).json({ error: 'internship cycle not found' });
  if (cycle.status !== 'open') return res.status(409).json({ error: 'opportunities can be posted only in the open cycle' });
  const [opp] = await writeOpportunity({
    cycle_id: d.cycle_id, title: d.title, organization_name: d.organization_name,
    description: d.description ?? null, eligibility: d.eligibility ?? null, eligible_department_ids: d.eligible_department_ids ?? [], minimum_cgpa: d.minimum_cgpa ?? null,
    application_deadline: d.application_deadline || null, application_url: d.application_url || null, opportunity_type: d.opportunity_type,
    is_active: true, accepting_applications: d.accepting_applications ?? true, posted_by: req.user.id,
  });
  await logAudit({ actorId: req.user.id, actorRole: 'crcs_superadmin', action: 'post_opportunity', entityType: 'crcs_opportunities', entityId: opp.id, newValue: opp });
  res.status(201).json(opp);
});

router.patch('/:id', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const existing = unwrap(await supabase.from('crcs_opportunities').select('*').eq('id', req.params.id).maybeSingle());
  if (!existing) return res.status(404).json({ error: 'opportunity not found' });
  const fields = { ...parsed.data };
  if (fields.eligible_department_ids?.length) {
    const departments = unwrap(await supabase.from('departments').select('id').in('id', fields.eligible_department_ids));
    if (departments.length !== fields.eligible_department_ids.length) return res.status(400).json({ error: 'Select only existing departments.' });
  }
  if (fields.application_deadline === '') fields.application_deadline = null;
  if (fields.application_url === '') fields.application_url = null;
  const nextType = fields.opportunity_type ?? existing.opportunity_type ?? 'exclusive';
  const nextUrl = fields.application_url === undefined ? existing.application_url : fields.application_url;
  if (nextType === 'open_source' && !nextUrl) return res.status(400).json({ error: 'An open-source opportunity needs the company application link.' });
  const [updated] = await writeOpportunity(fields, req.params.id);
  await logAudit({ actorId: req.user.id, actorRole: 'crcs_superadmin', action: 'edit_opportunity', entityType: 'crcs_opportunities', entityId: existing.id, oldValue: existing, newValue: updated });
  res.json(updated);
});

router.delete('/:id', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const existing = unwrap(await supabase.from('crcs_opportunities').select('*').eq('id', req.params.id).maybeSingle());
  if (!existing) return res.status(404).json({ error: 'opportunity not found' });
  // Prefer archival once the enhancement migration is deployed so application
  // history remains auditable. On the legacy schema, only delete un-applied rows.
  const archived = await supabase.from('crcs_opportunities').update({ is_active: false }).eq('id', req.params.id).select();
  if (archived.error) {
    const applications = unwrap(await supabase.from('opportunity_applications').select('id').eq('opportunity_id', req.params.id));
    if (applications.length) return res.status(409).json({ error: 'this opportunity has applications and cannot be deleted until the database enhancement migration is applied' });
    unwrap(await supabase.from('crcs_opportunities').delete().eq('id', req.params.id));
  }
  await logAudit({ actorId: req.user.id, actorRole: 'crcs_superadmin', action: 'delete_opportunity', entityType: 'crcs_opportunities', entityId: existing.id, oldValue: existing });
  res.status(204).end();
});

router.get('/my-applications', requireAuth, requireRole('student'), async (req, res) => {
  if (req.query.cycle_id && !(await requireVisibleCycle(req, res, req.query.cycle_id))) return;
  const apps = unwrap(await supabase.from('opportunity_applications').select('*').eq('student_id', req.user.id).order('created_at', { ascending: false }));
  const opportunityIds = [...new Set(apps.map((app) => app.opportunity_id))];
  const mentorIds = [...new Set(apps.map((app) => app.assigned_mentor_id).filter(Boolean))];
  const opportunities = opportunityIds.length ? unwrap(await supabase.from('crcs_opportunities').select('id,title,organization_name,cycle_id,opportunity_type,application_url').in('id', opportunityIds)) : [];
  const [mentors, mentorProfiles] = mentorIds.length ? await Promise.all([
    supabase.from('users').select('id,full_name,email,phone').in('id', mentorIds),
    supabase.from('faculty').select('id,cabin').in('id', mentorIds),
  ]).then(([users, faculty]) => [unwrap(users), unwrap(faculty)]) : [[], []];
  const opportunityById = Object.fromEntries(opportunities.map((row) => [row.id, row]));
  const cabinByMentorId = Object.fromEntries(mentorProfiles.map((mentor) => [mentor.id, mentor.cabin]));
  const mentorById = Object.fromEntries(mentors.map((row) => [row.id, { ...row, cabin: cabinByMentorId[row.id] ?? null }]));
  res.json(apps.filter((app) => !req.query.cycle_id || opportunityById[app.opportunity_id]?.cycle_id === req.query.cycle_id).map((app) => ({ ...app, opportunity: opportunityById[app.opportunity_id] ?? null, mentor: mentorById[app.assigned_mentor_id] ?? null })));
});

router.post('/:id/apply', requireAuth, requireRole('student'), async (req, res) => {
  const parsed = applicationSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!(await requireStudentPortalUnlocked(req, res))) return;
  const opportunity = unwrap(await supabase.from('crcs_opportunities').select('id,cycle_id,is_active,accepting_applications,application_deadline,eligible_department_ids,opportunity_type').eq('id', req.params.id).maybeSingle());
  if (!opportunity) return res.status(404).json({ error: 'opportunity not found' });
  if (opportunity.is_active === false) return res.status(400).json({ error: 'this opportunity is no longer available' });
  if (opportunity.accepting_applications === false) return res.status(400).json({ error: 'applications are currently closed for this opportunity' });
  if (deadlineHasPassed(opportunity.application_deadline)) return res.status(400).json({ error: 'applications are closed because the application deadline has passed' });
  const selection = unwrap(await supabase.from('student_track_selections').select('track').eq('student_id', req.user.id).eq('cycle_id', opportunity.cycle_id).maybeSingle());
  if (selection?.track !== 'crcs_opportunity') return res.status(403).json({ error: 'Select CRCS Internships in your internship preference before applying.' });
  if (opportunity.eligible_department_ids?.length) {
    const student = unwrap(await supabase.from('students').select('department_id').eq('id', req.user.id).maybeSingle());
    if (!student?.department_id || !opportunity.eligible_department_ids.includes(student.department_id)) return res.status(403).json({ error: 'This opportunity is not open to your department.' });
  }
  const approvedInternship = await findApprovedInternship(req.user.id);
  if (approvedInternship) return res.status(409).json({ error: `your approved ${approvedInternship.track} already occupies your exclusive internship track` });
  const selectedElsewhere = unwrap(await supabase.from('opportunity_applications').select('id,status').eq('student_id', req.user.id).eq('status', 'crcs_approved').maybeSingle());
  if (selectedElsewhere) return res.status(409).json({ error: 'an offered or approved CRCS opportunity already occupies your internship track' });
  const duplicate = unwrap(await supabase.from('opportunity_applications').select('id').eq('student_id', req.user.id).eq('opportunity_id', req.params.id).in('status', ['applied', 'under_review', 'offered', 'crcs_approved']).maybeSingle());
  if (duplicate) return res.status(409).json({ error: 'you already have an active application for this opportunity' });
  const payload = { student_id: req.user.id, opportunity_id: req.params.id, status: 'applied', application_answers: parsed.data.application_answers ?? null };
  let result = await supabase.from('opportunity_applications').insert(payload).select();
  if (result.error && /application_answers/.test(result.error.message)) {
    delete payload.application_answers;
    result = await supabase.from('opportunity_applications').insert(payload).select();
  }
  const { data, error } = result;
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data[0]);
});

const externalOfferSchema = z.object({
  offer_letter_doc_id: z.string().uuid(),
  offer_details: z.string().trim().min(3, 'Add the company selection details for CRCS.').max(4000),
});

// A student applies to an open-source role on the company website, then brings
// the company offer and a short confirmation back to the CRCS dashboard.
router.patch('/applications/:id/external-offer', requireAuth, requireRole('student'), async (req, res) => {
  const parsed = externalOfferSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!(await requireStudentPortalUnlocked(req, res))) return;
  const application = unwrap(await supabase.from('opportunity_applications').select('*').eq('id', req.params.id).maybeSingle());
  if (!application) return res.status(404).json({ error: 'application not found' });
  if (application.student_id !== req.user.id) return res.status(403).json({ error: 'forbidden' });
  if (!['applied', 'under_review', 'offered'].includes(application.status)) return res.status(409).json({ error: 'offer details can no longer be changed after a final decision' });
  const opportunity = unwrap(await supabase.from('crcs_opportunities').select('id,opportunity_type').eq('id', application.opportunity_id).maybeSingle());
  if (opportunity?.opportunity_type !== 'open_source') return res.status(400).json({ error: 'offer-letter upload is only used for open-source opportunities' });
  const offerLetter = unwrap(await supabase.from('documents').select('id').eq('id', parsed.data.offer_letter_doc_id).eq('student_id', req.user.id).eq('related_entity_type', 'opportunity_application').eq('related_entity_id', application.id).maybeSingle());
  if (!offerLetter) return res.status(400).json({ error: 'Upload the company offer letter for this application before submitting it to CRCS.' });
  const now = new Date().toISOString();
  const [updated] = unwrap(await supabase.from('opportunity_applications').update({
    status: 'offered', offer_letter_doc_id: offerLetter.id, external_offer_details: { details: parsed.data.offer_details }, updated_at: now,
  }).eq('id', application.id).select());
  await notify({ userId: req.user.id, title: 'Open-source offer submitted to CRCS', body: 'Your company offer letter and details are ready for CRCS review.', relatedEntityType: 'opportunity_application', relatedEntityId: application.id });
  await logAudit({ actorId: req.user.id, actorRole: 'student', action: 'submit_open_source_offer', entityType: 'opportunity_applications', entityId: application.id, oldValue: { status: application.status }, newValue: { status: 'offered', offer_letter_doc_id: offerLetter.id } });
  res.json(updated);
});

router.patch('/applications/:id/withdraw', requireAuth, requireRole('student'), async (req, res) => {
  if (!(await requireStudentPortalUnlocked(req, res))) return;
  const application = unwrap(await supabase.from('opportunity_applications').select('*').eq('id', req.params.id).maybeSingle());
  if (!application) return res.status(404).json({ error: 'application not found' });
  if (application.student_id !== req.user.id) return res.status(403).json({ error: 'forbidden' });

  // An external-company offer is still awaiting CRCS's final decision, so it
  // remains withdrawable just like a pending application.
  const withdrawableStatuses = ['applied', 'under_review', 'offered'];
  if (!withdrawableStatuses.includes(application.status)) {
    return res.status(400).json({ error: `an application with status ${application.status.replaceAll('_', ' ')} cannot be withdrawn` });
  }

  const now = new Date().toISOString();
  const [updated] = unwrap(await supabase.from('opportunity_applications').update({
    status: 'revoked',
    decision_by: req.user.id,
    decision_at: now,
    rejection_reason: 'Withdrawn by student.',
    updated_at: now,
  }).eq('id', application.id).select());
  await logAudit({
    actorId: req.user.id,
    actorRole: 'student',
    action: 'withdraw_opportunity_application',
    entityType: 'opportunity_applications',
    entityId: application.id,
    oldValue: { status: application.status },
    newValue: { status: 'revoked', reason: 'Withdrawn by student.' },
  });
  res.json(updated);
});

async function enrichApplications(applications) {
  const studentIds = [...new Set(applications.map((app) => app.student_id))];
  const mentorIds = [...new Set(applications.map((app) => app.assigned_mentor_id).filter(Boolean))];
  const [users, studentProfiles] = await Promise.all([
    studentIds.length ? unwrap(await supabase.from('users').select('id,full_name,email,phone').in('id', studentIds)) : [],
    studentIds.length ? unwrap(await supabase.from('students').select('id,roll_number,batch_year,cgpa,category,department_id').in('id', studentIds)) : [],
  ]);
  const [mentors, mentorProfiles] = mentorIds.length ? await Promise.all([
    supabase.from('users').select('id,full_name,email,phone').in('id', mentorIds),
    supabase.from('faculty').select('id,cabin').in('id', mentorIds),
  ]).then(([users, faculty]) => [unwrap(users), unwrap(faculty)]) : [[], []];
  const departmentIds = [...new Set(studentProfiles.map((profile) => profile.department_id).filter(Boolean))];
  const departments = departmentIds.length ? unwrap(await supabase.from('departments').select('id,name,code,school_id').in('id', departmentIds)) : [];
  const schoolIds = [...new Set(departments.map((department) => department.school_id).filter(Boolean))];
  const schools = schoolIds.length ? unwrap(await supabase.from('schools').select('id,name,code').in('id', schoolIds)) : [];
  const userById = Object.fromEntries(users.map((user) => [user.id, user]));
  const profileById = Object.fromEntries(studentProfiles.map((profile) => [profile.id, profile]));
  const departmentById = Object.fromEntries(departments.map((department) => [department.id, department]));
  const schoolById = Object.fromEntries(schools.map((school) => [school.id, school]));
  const cabinByMentorId = Object.fromEntries(mentorProfiles.map((mentor) => [mentor.id, mentor.cabin]));
  const mentorById = Object.fromEntries(mentors.map((mentor) => [mentor.id, { ...mentor, cabin: cabinByMentorId[mentor.id] ?? null }]));

  return Promise.all(applications.map(async (app) => {
    const documents = unwrap(await supabase.from('documents').select('*').eq('related_entity_type', 'opportunity_application').eq('related_entity_id', app.id).order('uploaded_at', { ascending: false }));
    const withUrls = await Promise.all(documents.map(async (doc) => ({ ...doc, url: await getSignedUrl(doc.file_path) })));
    const resume = withUrls.find((doc) => doc.id === app.resume_doc_id) ?? withUrls.find((doc) => /resume|cv/i.test(doc.file_name));
    const profile = profileById[app.student_id];
    const department = profile ? departmentById[profile.department_id] : null;
    return {
      ...app,
      student: userById[app.student_id] ? {
        ...userById[app.student_id],
        roll_number: profile?.roll_number ?? null,
        batch_year: profile?.batch_year ?? null,
        cgpa: profile?.cgpa ?? null,
        category: profile?.category ?? null,
        department: department ? { ...department, school: schoolById[department.school_id] ?? null } : null,
      } : null,
      mentor: mentorById[app.assigned_mentor_id] ?? null,
      documents: withUrls,
      resume: resume ?? null,
    };
  }));
}

router.get('/applications', requireAuth, requireRole('crcs_superadmin', 'crcs_coordinator'), requireCrcsPermission('view_opportunities'), async (req, res) => {
  if (req.query.cycle_id && !(await requireVisibleCycle(req, res, req.query.cycle_id))) return;
  let query = supabase.from('opportunity_applications').select('*').order('created_at', { ascending: false });
  if (req.query.status) query = query.eq('status', req.query.status);
  else query = query.neq('status', 'revoked');
  let apps = unwrap(await query);
  const opportunityIds = [...new Set(apps.map((app) => app.opportunity_id))];
  const opportunities = opportunityIds.length ? unwrap(await supabase.from('crcs_opportunities').select('id,title,organization_name,cycle_id').in('id', opportunityIds)) : [];
  const opportunityById = Object.fromEntries(opportunities.map((row) => [row.id, row]));
  if (req.query.cycle_id) apps = apps.filter((app) => opportunityById[app.opportunity_id]?.cycle_id === req.query.cycle_id);
  const details = await enrichApplications(apps);
  res.json(details.map((app) => ({ ...app, opportunity: opportunityById[app.opportunity_id] ?? null })));
});

router.get('/mentor-options', requireAuth, requireRole('crcs_superadmin', 'crcs_coordinator'), requireCrcsPermission('view_opportunities'), async (_req, res) => {
  res.json(await facultyMentors());
});

router.get('/:id', requireAuth, requireRole('crcs_superadmin', 'crcs_coordinator'), requireCrcsPermission('view_opportunities'), async (req, res) => {
  const opportunity = unwrap(await supabase.from('crcs_opportunities').select('*').eq('id', req.params.id).maybeSingle());
  if (!opportunity) return res.status(404).json({ error: 'opportunity not found' });
  const applications = unwrap(await supabase.from('opportunity_applications').select('*').eq('opportunity_id', req.params.id).neq('status', 'revoked').order('created_at', { ascending: false }));
  const details = await enrichApplications(applications);
  res.json({ ...opportunity, applications: details });
});

router.patch('/applications/:id/details', requireAuth, requireRole('student', 'crcs_superadmin'), async (req, res) => {
  const parsed = z.object({ application_answers: z.record(z.any()).optional(), resume_doc_id: z.string().uuid().optional() }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (req.user.roles.some((role) => role.role === 'student') && !(await requireStudentPortalUnlocked(req, res))) return;
  const application = unwrap(await supabase.from('opportunity_applications').select('*').eq('id', req.params.id).maybeSingle());
  if (!application) return res.status(404).json({ error: 'application not found' });
  if (req.user.roles.some((role) => role.role === 'student') && application.student_id !== req.user.id) return res.status(403).json({ error: 'forbidden' });
  let result = await supabase.from('opportunity_applications').update(parsed.data).eq('id', application.id).select();
  if (result.error && /application_answers|resume_doc_id/.test(result.error.message)) return res.status(409).json({ error: 'apply migration 20260907000002_opportunity_application_details.sql before saving answers or resumes' });
  res.json(unwrap(result)[0]);
});

const mentorSchema = z.object({ mentor_id: z.string().uuid() });

router.patch('/applications/:id/mentor', requireAuth, requireRole('crcs_superadmin', 'crcs_coordinator'), requireCrcsPermission('view_opportunities'), async (req, res) => {
  const parsed = mentorSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const application = unwrap(await supabase.from('opportunity_applications').select('*').eq('id', req.params.id).maybeSingle());
  if (!application) return res.status(404).json({ error: 'application not found' });
  if (application.status !== 'crcs_approved') return res.status(400).json({ error: 'a faculty mentor can be allocated only after CRCS approval' });
  const mentorProfile = unwrap(await supabase.from('faculty').select('id,mentorship_scope,cabin').eq('id', parsed.data.mentor_id).maybeSingle());
  const mentor = unwrap(await supabase.from('users').select('id,full_name,email,phone,is_active').eq('id', parsed.data.mentor_id).maybeSingle());
  if (!mentor?.is_active || mentorProfile?.mentorship_scope !== 'crcs_self') return res.status(400).json({ error: 'choose an active CRCS and self-internship faculty mentor' });
  if (application.assigned_mentor_id !== mentor.id) {
    const [opportunityAssignments, selfAssignments] = await Promise.all([
      supabase.from('opportunity_applications').select('id').eq('assigned_mentor_id', mentor.id).eq('status', 'crcs_approved'),
      supabase.from('self_internships').select('id').eq('assigned_mentor_id', mentor.id).eq('status', 'active'),
    ]);
    if (unwrap(opportunityAssignments).length + unwrap(selfAssignments).length >= 5) return res.status(409).json({ error: 'this mentor already has the maximum of 5 CRCS and self-internship students' });
  }
  const now = new Date().toISOString();
  const [updated] = unwrap(await supabase.from('opportunity_applications').update({ assigned_mentor_id: mentor.id, mentor_assigned_at: now, mentor_assigned_by: req.user.id, updated_at: now }).eq('id', application.id).select());
  await notify({ userId: application.student_id, title: 'Faculty mentor allocated', body: `${mentor.full_name} has been allocated as your faculty mentor.`, relatedEntityType: 'opportunity_application', relatedEntityId: application.id });
  await logAudit({ actorId: req.user.id, actorRole: req.user.roles.find((role) => ['crcs_superadmin', 'crcs_coordinator'].includes(role.role))?.role, action: 'allocate_opportunity_faculty_mentor', entityType: 'opportunity_applications', entityId: application.id, oldValue: { assigned_mentor_id: application.assigned_mentor_id ?? null }, newValue: { assigned_mentor_id: mentor.id } });
  res.json({ ...updated, mentor: { id: mentor.id, full_name: mentor.full_name, email: mentor.email, phone: mentor.phone, cabin: mentorProfile.cabin ?? null } });
});

const statusSchema = z.object({
  status: z.enum(['under_review', 'offered', 'crcs_approved', 'rejected']),
  reason: z.string().optional(),
}).superRefine((value, context) => {
  if (value.status === 'rejected' && !value.reason?.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'A rejection reason is required.' });
  }
});

const bulkStatusSchema = z.object({
  application_ids: z.array(z.string().uuid()).min(1).max(200),
  status: z.enum(['under_review', 'offered', 'crcs_approved', 'rejected']),
  reason: z.string().optional(),
}).superRefine((value, context) => {
  if (value.status === 'rejected' && !value.reason?.trim()) context.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'A rejection reason is required.' });
});

async function enforceOfferExclusivity(studentId, keptApplicationId, status, now) {
  if (status !== 'crcs_approved') return;
  const reason = 'Auto-revoked: CRCS approved another CRCS opportunity.';
  unwrap(await supabase.from('opportunity_applications').update({ status: 'revoked', rejection_reason: reason, updated_at: now })
    .eq('student_id', studentId).in('status', ['applied', 'under_review', 'offered']).neq('id', keptApplicationId));
  unwrap(await supabase.from('research_applications').update({ status: 'revoked', rejection_reason: reason, updated_at: now })
    .eq('student_id', studentId).in('status', ['pending_faculty', 'pending_crcs_approval']));
  await closeCompetingApplications(studentId, 'CRCS opportunity', now);
}

async function validateOpenSourceOfferForApproval(application) {
  const opportunity = unwrap(await supabase.from('crcs_opportunities').select('opportunity_type').eq('id', application.opportunity_id).maybeSingle());
  if (opportunity?.opportunity_type !== 'open_source') return;
  if (!application.offer_letter_doc_id || !application.external_offer_details?.details) {
    throw new Error('the student must submit company selection details and an offer letter before this open-source opportunity can be approved');
  }
  const document = unwrap(await supabase.from('documents').select('id').eq('id', application.offer_letter_doc_id).eq('student_id', application.student_id).eq('related_entity_type', 'opportunity_application').eq('related_entity_id', application.id).maybeSingle());
  if (!document) throw new Error('the submitted open-source offer letter is missing or does not belong to this application');
}

router.post('/applications/bulk-import', requireAuth, requireRole('crcs_superadmin', 'crcs_coordinator'), requireCrcsPermission('view_opportunities'), upload.single('file'), async (req, res) => {
  if (!req.file || !req.body.opportunity_id) return res.status(400).json({ error: 'an opportunity id and Excel or CSV file are required' });
  let rows = [];
  if (/\.xlsx$/i.test(req.file.originalname)) {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    rows = sheet ? XLSX.utils.sheet_to_json(sheet, { defval: '' }) : [];
  } else {
    const [header, ...lines] = req.file.buffer.toString('utf8').split(/\r?\n/).filter(Boolean);
    const headers = header.split(',').map((value) => value.trim());
    rows = lines.map((line) => Object.fromEntries(headers.map((key, index) => [key, line.split(',')[index]?.trim() ?? ''])));
  }
  const applications = unwrap(await supabase.from('opportunity_applications').select('id,student_id,status').eq('opportunity_id', req.body.opportunity_id).neq('status', 'revoked'));
  const studentIds = [...new Set(applications.map((application) => application.student_id))];
  const [users, students] = await Promise.all([studentIds.length ? supabase.from('users').select('id,email').in('id', studentIds) : { data: [] }, studentIds.length ? supabase.from('students').select('id,roll_number').in('id', studentIds) : { data: [] }]);
  const emailById = Object.fromEntries(unwrap(users).map((user) => [user.id, user.email.toLowerCase()]));
  const rollById = Object.fromEntries(unwrap(students).map((student) => [student.id, student.roll_number?.toLowerCase()]));
  const selected = new Set();
  for (const row of rows) {
    const email = String(row.email ?? row.student_email ?? '').trim().toLowerCase();
    const roll = String(row.roll_number ?? row.roll ?? '').trim().toLowerCase();
    const appId = String(row.application_id ?? '').trim();
    for (const application of applications) if (appId === application.id || (email && emailById[application.student_id] === email) || (roll && rollById[application.student_id] === roll)) selected.add(application.id);
  }
  res.json({ application_ids: [...selected], matched: selected.size, imported_rows: rows.length });
});

router.patch('/applications/bulk-status', requireAuth, requireRole('crcs_superadmin', 'crcs_coordinator'), requireCrcsPermission('view_opportunities'), async (req, res) => {
  const parsed = bulkStatusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { application_ids, status, reason } = parsed.data;
  const applications = unwrap(await supabase.from('opportunity_applications').select('*').in('id', application_ids));
  const now = new Date().toISOString();
  const actorRole = req.user.roles.find((role) => ['crcs_superadmin', 'crcs_coordinator'].includes(role.role))?.role;
  const updated = [];
  const skipped = application_ids.filter((id) => !applications.some((application) => application.id === id));
  if (status === 'crcs_approved') {
    const newApprovals = applications.filter((application) => application.status !== 'crcs_approved');
    if (new Set(newApprovals.map((application) => application.student_id)).size !== newApprovals.length) {
      return res.status(409).json({ error: 'a student can receive only one CRCS opportunity approval' });
    }
    for (const application of newApprovals) {
      const approvedInternship = await findApprovedInternship(application.student_id);
      if (approvedInternship) return res.status(409).json({ error: `${application.student_id} already has an approved ${approvedInternship.track}` });
      try { await validateOpenSourceOfferForApproval(application); } catch (error) { return res.status(400).json({ error: error.message }); }
    }
  }
  for (const application of applications) {
    if (application.status === 'revoked') { skipped.push(application.id); continue; }
    const [next] = unwrap(await supabase.from('opportunity_applications').update({
      status, decision_by: req.user.id, decision_at: now,
      rejection_reason: status === 'rejected' ? reason.trim() : null,
      updated_at: now,
    }).eq('id', application.id).select());
    await enforceOfferExclusivity(application.student_id, application.id, status, now);
    await notify({ userId: application.student_id, title: `Opportunity application ${status.replaceAll('_', ' ')}`, body: status === 'rejected' ? reason.trim() : null, relatedEntityType: 'opportunity_application', relatedEntityId: application.id });
    await logAudit({ actorId: req.user.id, actorRole, action: 'bulk_update_opportunity_application', entityType: 'opportunity_applications', entityId: application.id, oldValue: { status: application.status }, newValue: { status } });
    updated.push(next.id);
  }
  res.json({ updated, skipped });
});

router.patch('/applications/:id/status', requireAuth, requireRole('crcs_superadmin', 'crcs_coordinator'), requireCrcsPermission('view_opportunities'), async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { status, reason } = parsed.data;
  const application = unwrap(await supabase.from('opportunity_applications').select('*').eq('id', req.params.id).maybeSingle());
  if (!application) return res.status(404).json({ error: 'not found' });
  const allowed = {
    applied: ['under_review', 'offered', 'crcs_approved', 'rejected'],
    under_review: ['under_review', 'offered', 'crcs_approved', 'rejected'],
    offered: ['under_review', 'offered', 'crcs_approved', 'rejected'],
    crcs_approved: ['crcs_approved'],
    rejected: ['under_review', 'offered', 'crcs_approved', 'rejected'],
    revoked: [],
  };
  if (!allowed[application.status]?.includes(status)) return res.status(400).json({ error: `cannot move from ${application.status} to ${status}` });
  if (status === 'crcs_approved' && application.status !== 'crcs_approved') {
    const approvedInternship = await findApprovedInternship(application.student_id);
    if (approvedInternship) return res.status(409).json({ error: `student already has an approved ${approvedInternship.track}` });
    try { await validateOpenSourceOfferForApproval(application); } catch (error) { return res.status(400).json({ error: error.message }); }
  }
  const now = new Date().toISOString();
  const [updated] = unwrap(await supabase.from('opportunity_applications').update({ status, decision_by: req.user.id, decision_at: now, rejection_reason: status === 'rejected' ? reason.trim() : null, updated_at: now }).eq('id', application.id).select());
  await enforceOfferExclusivity(application.student_id, application.id, status, now);
  await notify({ userId: application.student_id, title: `Opportunity application ${status.replaceAll('_', ' ')}`, body: reason ?? null, relatedEntityType: 'opportunity_application', relatedEntityId: application.id });
  await logAudit({ actorId: req.user.id, actorRole: req.user.roles.find((role) => ['crcs_superadmin', 'crcs_coordinator'].includes(role.role))?.role, action: 'update_opportunity_application', entityType: 'opportunity_applications', entityId: application.id, oldValue: { status: application.status }, newValue: { status } });
  res.json(updated);
});

export default router;
