import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { supabase, unwrap } from '../db/client.js';
import { requireAuth, requireRole, scopeToDepartment } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';
import { notify } from '../lib/notifications.js';
import { saveFile, getSignedUrl } from '../lib/storage.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/report-templates', requireAuth, async (req, res) => {
  const { track } = req.query;
  let query = supabase.from('report_templates').select('*').order('created_at');
  if (track) query = query.or(`track.is.null,track.eq.${track}`);
  res.json(unwrap(await query));
});

const templateSchema = z.object({
  name: z.string().min(1),
  track: z.enum(['research', 'crcs_opportunity', 'self_internship']).optional(),
  schema: z.record(z.any()).optional(),
});

router.post('/report-templates', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const parsed = templateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { name, track, schema } = parsed.data;
  const [tpl] = unwrap(await supabase.from('report_templates').insert({
    name, track: track ?? null, is_default: false, schema: schema ?? null, created_by: req.user.id,
  }).select());
  res.status(201).json(tpl);
});

const uploadFieldsSchema = z.object({
  report_template_id: z.string().uuid().optional(),
  report_deadline_id: z.string().uuid().optional(),
  upload_purpose: z.enum(['application_resume', 'self_internship_supporting']).optional(),
  supporting_document_type: z.enum(['company_profile', 'offer_letter']).optional(),
  related_entity_type: z.enum(['research_application', 'self_internship', 'opportunity_application']),
  related_entity_id: z.string().uuid(),
  week_number: z.coerce.number().int().optional(),
});

router.post('/documents/upload', requireAuth, requireRole('student'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file is required (field "file")' });
  const parsed = uploadFieldsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { report_template_id, report_deadline_id, upload_purpose, supporting_document_type, related_entity_type, related_entity_id, week_number } = parsed.data;
  const isSelfInternshipSupportingDocument = upload_purpose === 'self_internship_supporting';
  if (isSelfInternshipSupportingDocument && (related_entity_type !== 'self_internship' || !supporting_document_type)) {
    return res.status(400).json({ error: 'choose whether this self-internship supporting document is the company profile or offer letter' });
  }

  // A student may only attach a file to an internship/application they own.
  // This also prevents using the upload endpoint to smuggle a resume into a
  // different student's application.
  let cycleId = null;
  if (related_entity_type === 'opportunity_application') {
    const application = unwrap(await supabase.from('opportunity_applications').select('student_id,status,assigned_mentor_id,opportunity_id').eq('id', related_entity_id).maybeSingle());
    if (!application) return res.status(404).json({ error: 'opportunity application not found' });
    if (application.student_id !== req.user.id) return res.status(403).json({ error: 'you may only upload to your own application' });
    if (application.status !== 'crcs_approved' && upload_purpose !== 'application_resume') return res.status(400).json({ error: 'documents unlock after CRCS approves this opportunity application' });
    if (!application.assigned_mentor_id && upload_purpose !== 'application_resume') return res.status(400).json({ error: 'wait for CRCS to allocate your faculty mentor before uploading internship documents' });
    const opportunity = unwrap(await supabase.from('crcs_opportunities').select('cycle_id').eq('id', application.opportunity_id).maybeSingle());
    cycleId = opportunity?.cycle_id ?? null;
  } else if (related_entity_type === 'research_application') {
    const application = unwrap(await supabase.from('research_applications').select('student_id,status,project_id').eq('id', related_entity_id).maybeSingle());
    if (!application) return res.status(404).json({ error: 'research application not found' });
    if (application.student_id !== req.user.id) return res.status(403).json({ error: 'you may only upload to your own application' });
    if (application.status !== 'crcs_approved') return res.status(400).json({ error: 'documents unlock after CRCS approves this research application' });
    const project = unwrap(await supabase.from('research_projects').select('cycle_id').eq('id', application.project_id).maybeSingle());
    cycleId = project?.cycle_id ?? null;
  } else if (related_entity_type === 'self_internship') {
    const internship = unwrap(await supabase.from('self_internships').select('student_id,status,assigned_mentor_id,cycle_id').eq('id', related_entity_id).maybeSingle());
    if (!internship) return res.status(404).json({ error: 'self-internship not found' });
    if (internship.student_id !== req.user.id) return res.status(403).json({ error: 'you may only upload to your own internship' });
    if (isSelfInternshipSupportingDocument) {
      if (!['submitted', 'rejected'].includes(internship.status)) return res.status(400).json({ error: 'supporting documents are locked after CRCS approves this self-internship' });
    } else {
      if (internship.status !== 'active') return res.status(400).json({ error: 'documents unlock after CRCS approves and activates this self-internship' });
      if (!internship.assigned_mentor_id) return res.status(400).json({ error: 'wait for CRCS to allocate your faculty mentor before uploading internship documents' });
    }
    cycleId = internship.cycle_id;
  }

  if (upload_purpose !== 'application_resume' && cycleId) {
    const existingMarks = unwrap(await supabase.from('marks').select('id').eq('student_id', req.user.id).eq('cycle_id', cycleId).maybeSingle());
    if (existingMarks) return res.status(409).json({ error: 'report uploads are locked because your mentor has already awarded marks for this internship cycle' });
  }

  if (!report_deadline_id && !['application_resume', 'self_internship_supporting'].includes(upload_purpose)) {
    return res.status(400).json({ error: 'select the report deadline set by your faculty mentor' });
  }
  if (report_deadline_id) {
    const deadlineResult = await supabase.from('report_deadlines').select('*').eq('id', report_deadline_id).maybeSingle();
    if (deadlineResult.error && /report_deadlines/i.test(deadlineResult.error.message)) return res.status(409).json({ error: 'apply migration 20260907000005_report_deadlines.sql before uploading deadline-based reports' });
    const deadline = unwrap(deadlineResult);
    if (!deadline) return res.status(404).json({ error: 'report deadline not found' });
    if (deadline.student_id !== req.user.id || deadline.related_entity_type !== related_entity_type || deadline.related_entity_id !== related_entity_id) {
      return res.status(403).json({ error: 'the selected deadline does not belong to this internship record' });
    }
    if (new Date(deadline.due_at) < new Date()) return res.status(400).json({ error: 'this report deadline has passed' });
  }

  const { filePath } = await saveFile({
    buffer: req.file.buffer,
    originalName: req.file.originalname,
    studentId: req.user.id,
  });

  const payload = {
    student_id: req.user.id,
    report_template_id: report_template_id ?? null,
    report_deadline_id: report_deadline_id ?? null,
    related_entity_type,
    related_entity_id,
    file_path: filePath,
    file_name: req.file.originalname,
    week_number: week_number ?? null,
  };
  let inserted = await supabase.from('documents').insert(payload).select();
  if (inserted.error && /report_deadline_id/.test(inserted.error.message)) {
    if (report_deadline_id) return res.status(409).json({ error: 'apply migration 20260907000005_report_deadlines.sql before uploading deadline-based reports' });
    delete payload.report_deadline_id;
    inserted = await supabase.from('documents').insert(payload).select();
  }
  const [doc] = unwrap(inserted);

  if (isSelfInternshipSupportingDocument) {
    const documentField = supporting_document_type === 'offer_letter' ? 'offer_letter_doc_id' : 'company_profile_doc_id';
    const supportingRecord = unwrap(await supabase.from('self_internships').select('status').eq('id', related_entity_id).maybeSingle());
    const update = { [documentField]: doc.id, updated_at: new Date().toISOString() };
    if (supportingRecord?.status === 'rejected') {
      update.status = 'submitted';
      update.rejection_reason = null;
      update.rejected_by_role = null;
    }
    unwrap(await supabase.from('self_internships').update(update).eq('id', related_entity_id));
  }

  const url = await getSignedUrl(doc.file_path);
  res.status(201).json({ ...doc, url });
});

const reviewSchema = z.object({
  review_status: z.enum(['verified', 'revision_requested']),
  review_comment: z.string().optional(),
}).superRefine((value, context) => {
  if (value.review_status === 'revision_requested' && !value.review_comment?.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['review_comment'], message: 'A revision reason is required.' });
  }
});

const commentSchema = z.object({ comment: z.string().trim().min(1, 'Enter a comment before sending it.').max(2000) });

async function canManageDocument(req, doc) {
  const isFaculty = req.user.roles.some((role) => role.role === 'faculty');
  const isCrcs = req.user.roles.some((role) => ['crcs_superadmin', 'crcs_coordinator'].includes(role.role));
  if (!isFaculty || isCrcs) return true;
  if (doc.related_entity_type === 'research_application') return Boolean(unwrap(await supabase.from('mentor_assignments').select('id').eq('student_id', doc.student_id).eq('faculty_id', req.user.id).eq('is_current', true).maybeSingle()));
  if (doc.related_entity_type === 'opportunity_application') return Boolean(unwrap(await supabase.from('opportunity_applications').select('id').eq('id', doc.related_entity_id).eq('assigned_mentor_id', req.user.id).maybeSingle()));
  return Boolean(unwrap(await supabase.from('self_internships').select('id').eq('id', doc.related_entity_id).eq('assigned_mentor_id', req.user.id).maybeSingle()));
}

router.patch('/documents/:id/comment', requireAuth, requireRole('faculty', 'crcs_coordinator', 'crcs_superadmin'), async (req, res) => {
  const parsed = commentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const doc = unwrap(await supabase.from('documents').select('*').eq('id', req.params.id).maybeSingle());
  if (!doc) return res.status(404).json({ error: 'not found' });
  if (!(await canManageDocument(req, doc))) return res.status(403).json({ error: 'not the current mentor for this student' });
  const [updated] = unwrap(await supabase.from('documents').update({ review_comment: parsed.data.comment, reviewed_by: req.user.id, reviewed_at: new Date().toISOString() }).eq('id', doc.id).select());
  await notify({ userId: doc.student_id, title: 'Mentor feedback on your report', body: parsed.data.comment, relatedEntityType: 'document', relatedEntityId: doc.id });
  await logAudit({ actorId: req.user.id, actorRole: req.user.roles[0]?.role, action: 'comment_on_document', entityType: 'documents', entityId: doc.id, oldValue: { review_comment: doc.review_comment ?? null }, newValue: { review_comment: parsed.data.comment } });
  res.json(updated);
});

router.patch('/documents/:id/review', requireAuth, requireRole('faculty', 'crcs_coordinator', 'crcs_superadmin'), async (req, res) => {
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { review_status, review_comment } = parsed.data;

  const doc = unwrap(await supabase.from('documents').select('*').eq('id', req.params.id).maybeSingle());
  if (!doc) return res.status(404).json({ error: 'not found' });

  const isFaculty = req.user.roles.some((r) => r.role === 'faculty');
  const isCrcs = req.user.roles.some((r) => r.role === 'crcs_superadmin' || r.role === 'crcs_coordinator');
  if (isFaculty && !isCrcs) {
    let isAssigned = false;
    if (doc.related_entity_type === 'research_application') {
      const assignment = unwrap(await supabase.from('mentor_assignments').select('id').eq('student_id', doc.student_id).eq('faculty_id', req.user.id).eq('is_current', true).maybeSingle());
      isAssigned = !!assignment;
    } else if (doc.related_entity_type === 'opportunity_application') {
      const application = unwrap(await supabase.from('opportunity_applications').select('id').eq('id', doc.related_entity_id).eq('assigned_mentor_id', req.user.id).maybeSingle());
      isAssigned = !!application;
    } else if (doc.related_entity_type === 'self_internship') {
      const internship = unwrap(await supabase.from('self_internships').select('id').eq('id', doc.related_entity_id).eq('assigned_mentor_id', req.user.id).maybeSingle());
      isAssigned = !!internship;
    }
    if (!isAssigned) return res.status(403).json({ error: 'not the current mentor for this student' });
  }

  const [updated] = unwrap(await supabase.from('documents').update({
    review_status, review_comment: review_comment ?? null, reviewed_by: req.user.id, reviewed_at: new Date().toISOString(),
  }).eq('id', req.params.id).select());

  await notify({
    userId: doc.student_id,
    title: `Document ${review_status === 'verified' ? 'verified' : 'needs revision'}`,
    body: review_comment ?? null,
    relatedEntityType: 'document',
    relatedEntityId: doc.id,
  });
  await logAudit({
    actorId: req.user.id,
    actorRole: req.user.roles[0]?.role,
    action: 'review_document',
    entityType: 'documents',
    entityId: doc.id,
    oldValue: { review_status: doc.review_status },
    newValue: { review_status },
  });

  res.json(updated);
});

router.get('/documents', requireAuth, async (req, res) => {
  const { student_id, related_entity_id } = req.query;
  const roles = req.user.roles.map((r) => r.role);

  if (roles.includes('student') && student_id && student_id !== req.user.id) {
    return res.status(403).json({ error: 'students may only view their own documents' });
  }

  let query = supabase.from('documents').select('*').order('uploaded_at', { ascending: false });
  if (related_entity_id) query = query.eq('related_entity_id', related_entity_id);

  if (roles.includes('student')) {
    query = query.eq('student_id', req.user.id);
  } else if (roles.includes('crcs_superadmin') || roles.includes('crcs_coordinator')) {
    if (student_id) query = query.eq('student_id', student_id);
  } else {
    // Faculty may only see their current mentees; the broader department/school
    // scope below is reserved for oversight roles.
    if (roles.includes('faculty')) {
      const [researchAssignments, opportunityAssignments, selfAssignments] = await Promise.all([
        supabase.from('mentor_assignments').select('student_id').eq('faculty_id', req.user.id).eq('is_current', true),
        supabase.from('opportunity_applications').select('student_id').eq('assigned_mentor_id', req.user.id).eq('status', 'crcs_approved'),
        supabase.from('self_internships').select('student_id').eq('assigned_mentor_id', req.user.id).eq('status', 'active'),
      ]);
      const menteeIds = [...new Set([...unwrap(researchAssignments), ...unwrap(opportunityAssignments), ...unwrap(selfAssignments)].map((assignment) => assignment.student_id))];
      if (!menteeIds.length) return res.json([]);
      query = query.in('student_id', menteeIds);
    } else {
      // Faculty Coordinator/HOD/Dean — scope via department/school, resolved through students.
    const scope = scopeToDepartment(req);
    if (!scope.isSystemWide) {
      let studentIdsQuery = supabase.from('students').select('id');
      if (scope.schoolIds?.length) {
        const depts = unwrap(await supabase.from('departments').select('id').in('school_id', scope.schoolIds));
        studentIdsQuery = studentIdsQuery.in('department_id', depts.map((d) => d.id));
      } else if (scope.departmentIds?.length) {
        studentIdsQuery = studentIdsQuery.in('department_id', scope.departmentIds);
      } else {
        return res.json([]);
      }
      const students = unwrap(await studentIdsQuery);
      query = query.in('student_id', students.map((s) => s.id));
    }
    }
    if (student_id) query = query.eq('student_id', student_id);
  }

  const rows = unwrap(await query);
  const studentIds = [...new Set(rows.map((row) => row.student_id))];
  const deadlineIds = [...new Set(rows.map((row) => row.report_deadline_id).filter(Boolean))];
  const templateIds = [...new Set(rows.map((row) => row.report_template_id).filter(Boolean))];
  const researchIds = [...new Set(rows.filter((row) => row.related_entity_type === 'research_application').map((row) => row.related_entity_id))];
  const opportunityIds = [...new Set(rows.filter((row) => row.related_entity_type === 'opportunity_application').map((row) => row.related_entity_id))];
  const selfInternshipIds = [...new Set(rows.filter((row) => row.related_entity_type === 'self_internship').map((row) => row.related_entity_id))];
  const [students, deadlines, templates, researchApplications, opportunityApplications, selfInternships] = await Promise.all([
    studentIds.length ? supabase.from('users').select('id,full_name,email').in('id', studentIds) : { data: [] },
    deadlineIds.length ? supabase.from('report_deadlines').select('id,title,due_at').in('id', deadlineIds) : { data: [] },
    templateIds.length ? supabase.from('report_templates').select('id,name').in('id', templateIds) : { data: [] },
    researchIds.length ? supabase.from('research_applications').select('id,project_id').in('id', researchIds) : { data: [] },
    opportunityIds.length ? supabase.from('opportunity_applications').select('id,opportunity_id').in('id', opportunityIds) : { data: [] },
    selfInternshipIds.length ? supabase.from('self_internships').select('id,company_name').in('id', selfInternshipIds) : { data: [] },
  ]);
  const researchRows = unwrap(researchApplications);
  const opportunityRows = unwrap(opportunityApplications);
  const researchProjectIds = [...new Set(researchRows.map((row) => row.project_id))];
  const opportunityDetailIds = [...new Set(opportunityRows.map((row) => row.opportunity_id))];
  const [researchProjects, opportunities] = await Promise.all([
    researchProjectIds.length ? supabase.from('research_projects').select('id,title').in('id', researchProjectIds) : { data: [] },
    opportunityDetailIds.length ? supabase.from('crcs_opportunities').select('id,title,organization_name').in('id', opportunityDetailIds) : { data: [] },
  ]);
  const [selfApprovalRecords, opportunityApprovalRecords] = await Promise.all([
    studentIds.length ? supabase.from('self_internships').select('student_id,company_profile_doc_id,offer_letter_doc_id,certificate_doc_id').in('student_id', studentIds) : { data: [] },
    studentIds.length ? supabase.from('opportunity_applications').select('student_id,resume_doc_id').in('student_id', studentIds) : { data: [] },
  ]);
  const selfApprovalRows = unwrap(selfApprovalRecords);
  const opportunityApprovalRows = opportunityApprovalRecords.error && /resume_doc_id/i.test(opportunityApprovalRecords.error.message)
    ? []
    : unwrap(opportunityApprovalRecords);
  const studentById = Object.fromEntries(unwrap(students).map((row) => [row.id, row]));
  const deadlineById = Object.fromEntries(unwrap(deadlines).map((row) => [row.id, row]));
  const templateById = Object.fromEntries(unwrap(templates).map((row) => [row.id, row]));
  const researchById = Object.fromEntries(researchRows.map((row) => [row.id, row]));
  const opportunityById = Object.fromEntries(opportunityRows.map((row) => [row.id, row]));
  const selfInternshipById = Object.fromEntries(unwrap(selfInternships).map((row) => [row.id, row]));
  const projectById = Object.fromEntries(unwrap(researchProjects).map((row) => [row.id, row]));
  const opportunityDetailById = Object.fromEntries(unwrap(opportunities).map((row) => [row.id, row]));
  const approvalDocumentTypeById = {};
  selfApprovalRows.forEach((record) => {
    if (record.company_profile_doc_id) approvalDocumentTypeById[record.company_profile_doc_id] = 'Company profile submitted to CRCS';
    if (record.offer_letter_doc_id) approvalDocumentTypeById[record.offer_letter_doc_id] = 'Offer letter submitted to CRCS';
    if (record.certificate_doc_id) approvalDocumentTypeById[record.certificate_doc_id] = 'Completion certificate submitted to CRCS';
  });
  opportunityApprovalRows.forEach((record) => {
    if (record.resume_doc_id) approvalDocumentTypeById[record.resume_doc_id] = 'Application resume submitted to CRCS';
  });
  const withUrls = await Promise.all(rows.map(async (doc) => {
    let internship = null;
    if (doc.related_entity_type === 'research_application') {
      const application = researchById[doc.related_entity_id];
      internship = { type: 'Research internship', title: projectById[application?.project_id]?.title ?? 'Research project' };
    } else if (doc.related_entity_type === 'opportunity_application') {
      const application = opportunityById[doc.related_entity_id];
      const opportunity = opportunityDetailById[application?.opportunity_id];
      internship = { type: 'CRCS opportunity', title: opportunity?.title ?? 'CRCS opportunity' };
    } else if (doc.related_entity_type === 'self_internship') {
      internship = { type: 'Self-internship', title: selfInternshipById[doc.related_entity_id]?.company_name ?? 'Self-internship' };
    }
    return { ...doc, url: await getSignedUrl(doc.file_path), student: studentById[doc.student_id] ?? null, deadline: deadlineById[doc.report_deadline_id] ?? null, report_template: templateById[doc.report_template_id] ?? null, internship, approval_document_type: approvalDocumentTypeById[doc.id] ?? null };
  }));
  res.json(withUrls);
});

export default router;
