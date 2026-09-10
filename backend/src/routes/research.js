import { Router } from 'express';
import { z } from 'zod';
import { supabase, unwrap } from '../db/client.js';
import { requireAuth, requireRole, requireCrcsPermission, scopeToDepartment } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';
import { notify } from '../lib/notifications.js';
import { getSignedUrl } from '../lib/storage.js';
import { closeCompetingApplications, findApprovedInternship } from '../lib/internshipExclusivity.js';
import { requireFacultyProjectsUnlocked, requireFacultyAssignmentsUnlocked, requireStudentPortalUnlocked } from '../lib/portalLocks.js';
import { requireVisibleCycle } from '../lib/cycleVisibility.js';

const router = Router();

router.get('/my-mentor-profile', requireAuth, requireRole('faculty'), async (req, res) => {
  const profile = unwrap(await supabase.from('faculty').select('id,department_id,mentorship_scope,cabin').eq('id', req.user.id).maybeSingle());
  if (!profile) return res.status(404).json({ error: 'faculty profile not found' });
  res.json(profile);
});

router.get('/my-profile', requireAuth, requireRole('faculty'), async (req, res) => {
  const [userResult, facultyResult] = await Promise.all([
    supabase.from('users').select('id,full_name,email,phone').eq('id', req.user.id).maybeSingle(),
    supabase.from('faculty').select('id,department_id,designation,mentorship_scope,cabin').eq('id', req.user.id).maybeSingle(),
  ]);
  const user = unwrap(userResult);
  const faculty = unwrap(facultyResult);
  if (!user || !faculty) return res.status(404).json({ error: 'faculty profile not found' });
  res.json({ ...user, ...faculty });
});

const facultyProfileSchema = z.object({ cabin: z.string().trim().max(200).nullable() });

router.patch('/my-profile', requireAuth, requireRole('faculty'), async (req, res) => {
  const parsed = facultyProfileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const profile = unwrap(await supabase.from('faculty').select('id,cabin').eq('id', req.user.id).maybeSingle());
  if (!profile) return res.status(404).json({ error: 'faculty profile not found' });
  const [updated] = unwrap(await supabase.from('faculty').update({ cabin: parsed.data.cabin || null }).eq('id', req.user.id).select('id,department_id,designation,mentorship_scope,cabin'));
  await logAudit({ actorId: req.user.id, actorRole: 'faculty', action: 'update_faculty_cabin', entityType: 'faculty', entityId: req.user.id, oldValue: { cabin: profile.cabin ?? null }, newValue: { cabin: updated.cabin ?? null } });
  res.json(updated);
});

// ---------- projects ----------

router.get('/projects', requireAuth, async (req, res) => {
  const { cycle_id, department_id } = req.query;
  if (cycle_id && !(await requireVisibleCycle(req, res, cycle_id))) return;
  const { departmentIds, schoolIds, isSystemWide } = scopeToDepartment(req);

  let query = supabase.from('research_projects').select('*').order('created_at', { ascending: false });
  if (cycle_id) query = query.eq('cycle_id', cycle_id);

  let allowedFacultyIds = null;
  if (department_id) {
    const faculty = unwrap(await supabase.from('faculty').select('id').eq('department_id', department_id));
    allowedFacultyIds = faculty.map((f) => f.id);
  } else if (!isSystemWide) {
    let deptIds = departmentIds;
    if (schoolIds) {
      const depts = unwrap(await supabase.from('departments').select('id').in('school_id', schoolIds));
      deptIds = depts.map((d) => d.id);
    }
    if (deptIds) {
      const faculty = unwrap(await supabase.from('faculty').select('id').in('department_id', deptIds));
      allowedFacultyIds = faculty.map((f) => f.id);
    }
  }
  if (allowedFacultyIds) query = query.in('faculty_id', allowedFacultyIds);

  const projects = unwrap(await query);

  const facultyIds = [...new Set(projects.map((p) => p.faculty_id))];
  const facultyRows = facultyIds.length ? unwrap(await supabase.from('faculty').select('id, department_id, cabin').in('id', facultyIds)) : [];
  const userRows = facultyIds.length ? unwrap(await supabase.from('users').select('id, full_name, email, phone').in('id', facultyIds)) : [];
  const facultyById = Object.fromEntries(facultyRows.map((faculty) => [faculty.id, faculty]));
  const userById = Object.fromEntries(userRows.map((user) => [user.id, user]));

  res.json(projects.map((project) => {
    const faculty = facultyById[project.faculty_id];
    const user = userById[project.faculty_id];
    return {
      ...project,
      department_id: faculty?.department_id ?? null,
      faculty_name: user?.full_name ?? null,
      faculty: user ? { ...user, cabin: faculty?.cabin ?? null } : null,
    };
  }));
});

const projectSchema = z.object({
  cycle_id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().min(1),
  max_students: z.number().int().min(1).max(4).optional(),
});

router.post('/projects', requireAuth, requireRole('faculty'), async (req, res) => {
  const parsed = projectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { cycle_id, title, description, max_students } = parsed.data;
  const cycle = unwrap(await supabase.from('internship_cycles').select('id,status').eq('id', cycle_id).maybeSingle());
  if (!cycle) return res.status(404).json({ error: 'internship cycle not found' });
  if (cycle.status !== 'open') return res.status(409).json({ error: 'projects can be created only in the open cycle' });
  if (!(await requireFacultyProjectsUnlocked(req.user.id, res))) return;
  const mentorProfile = unwrap(await supabase.from('faculty').select('mentorship_scope').eq('id', req.user.id).maybeSingle());
  if (mentorProfile?.mentorship_scope !== 'research') return res.status(403).json({ error: 'your faculty profile is configured for CRCS and self-internship mentorship, not research projects' });
  const existingProjects = unwrap(await supabase.from('research_projects').select('id').eq('faculty_id', req.user.id));
  if (existingProjects.length >= 4) return res.status(409).json({ error: 'a research mentor can create a maximum of 4 projects' });
  const [project] = unwrap(await supabase.from('research_projects').insert({
    faculty_id: req.user.id, cycle_id, title, description, max_students: max_students ?? 4,
  }).select());
  res.status(201).json(project);
});

// Application queues are intentionally first-class API resources.  Earlier UI
// code tried to infer them from projects, which left every approval queue empty.
router.get('/applications', requireAuth, requireCrcsPermission('view_research_approvals'), async (req, res) => {
  const roles = req.user.roles.map((role) => role.role);
  const status = req.query.status;
  const cycleId = req.query.cycle_id;
  if (cycleId && !(await requireVisibleCycle(req, res, cycleId))) return;
  let query = supabase.from('research_applications').select('*').order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  let apps = unwrap(await query);

  const projectIds = [...new Set(apps.map((app) => app.project_id))];
  const studentIds = [...new Set(apps.map((app) => app.student_id))];
  const projects = projectIds.length ? unwrap(await supabase.from('research_projects').select('id,title,faculty_id,cycle_id').in('id', projectIds)) : [];
  const projectById = Object.fromEntries(projects.map((project) => [project.id, project]));
  if (cycleId) apps = apps.filter((app) => projectById[app.project_id]?.cycle_id === cycleId);

  if (roles.includes('faculty') && !roles.some((role) => ['crcs_superadmin', 'crcs_coordinator'].includes(role))) {
    apps = apps.filter((app) => projectById[app.project_id]?.faculty_id === req.user.id);
  } else if (!roles.some((role) => ['crcs_superadmin', 'crcs_coordinator'].includes(role))) {
    const scope = scopeToDepartment(req);
    const students = studentIds.length ? unwrap(await supabase.from('students').select('id,department_id').in('id', studentIds)) : [];
    const allowedStudentIds = new Set(students.filter((student) => scope.departmentIds?.includes(student.department_id)).map((student) => student.id));
    apps = apps.filter((app) => allowedStudentIds.has(app.student_id));
  }

  const visibleStudentIds = [...new Set(apps.map((app) => app.student_id))];
  const [users, studentProfiles] = await Promise.all([
    visibleStudentIds.length ? supabase.from('users').select('id,full_name,email,phone').in('id', visibleStudentIds) : { data: [] },
    visibleStudentIds.length ? supabase.from('students').select('id,roll_number,batch_year,cgpa,department_id').in('id', visibleStudentIds) : { data: [] },
  ]);
  const profileRows = unwrap(studentProfiles);
  const departmentIds = [...new Set(profileRows.map((profile) => profile.department_id).filter(Boolean))];
  const departments = departmentIds.length ? unwrap(await supabase.from('departments').select('id,name,code,school_id').in('id', departmentIds)) : [];
  const schoolIds = [...new Set(departments.map((department) => department.school_id).filter(Boolean))];
  const schools = schoolIds.length ? unwrap(await supabase.from('schools').select('id,name,code').in('id', schoolIds)) : [];
  const userById = Object.fromEntries(unwrap(users).map((user) => [user.id, user]));
  const profileById = Object.fromEntries(profileRows.map((profile) => [profile.id, profile]));
  const departmentById = Object.fromEntries(departments.map((department) => [department.id, department]));
  const schoolById = Object.fromEntries(schools.map((school) => [school.id, school]));
  const resumeDocIds = [...new Set(apps.map((app) => app.resume_doc_id).filter(Boolean))];
  const resumeDocs = resumeDocIds.length ? unwrap(await supabase.from('documents').select('id,file_name,file_path').in('id', resumeDocIds)) : [];
  const resumeById = Object.fromEntries(await Promise.all(resumeDocs.map(async (doc) => [doc.id, { ...doc, url: await getSignedUrl(doc.file_path) }])));
  res.json(apps.map((app) => ({
    ...app,
    project_title: projectById[app.project_id]?.title ?? 'Research project',
    student_name: userById[app.student_id]?.full_name ?? 'Student',
    student_email: userById[app.student_id]?.email ?? null,
    resume: app.resume_doc_id ? resumeById[app.resume_doc_id] ?? null : null,
    student: userById[app.student_id] ? {
      ...userById[app.student_id],
      ...profileById[app.student_id],
      department: profileById[app.student_id]?.department_id ? {
        ...departmentById[profileById[app.student_id].department_id],
        school: schoolById[departmentById[profileById[app.student_id].department_id]?.school_id] ?? null,
      } : null,
    } : null,
  })));
});

router.get('/mentees', requireAuth, requireRole('faculty'), async (req, res) => {
  const assignments = unwrap(await supabase.from('mentor_assignments').select('*').eq('faculty_id', req.user.id).eq('is_current', true));
  const studentIds = assignments.map((assignment) => assignment.student_id);
  if (!studentIds.length) return res.json([]);
  const students = unwrap(await supabase.from('users').select('id,full_name,email').in('id', studentIds));
  const studentById = Object.fromEntries(students.map((student) => [student.id, student]));
  res.json(assignments.map((assignment) => ({ ...assignment, student: studentById[assignment.student_id] ?? null })));
});

const projectPatchSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
}).refine((v) => Object.keys(v).length > 0, { message: 'no fields to update' });

router.patch('/projects/:id', requireAuth, requireRole('faculty'), async (req, res) => {
  const parsed = projectPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const project = unwrap(await supabase.from('research_projects').select('*').eq('id', req.params.id).maybeSingle());
  if (!project) return res.status(404).json({ error: 'not found' });
  if (project.faculty_id !== req.user.id) return res.status(403).json({ error: 'not your project' });
  if (!(await requireFacultyProjectsUnlocked(project.faculty_id, res))) return;
  // §4.1 lock rule: once >=1 approved student, title/description/scope are immutable.
  if (project.status === 'locked' || project.status === 'full') {
    return res.status(403).json({ error: 'project is locked — core fields immutable once a student is approved' });
  }

  const [updated] = unwrap(await supabase.from('research_projects').update(parsed.data).eq('id', req.params.id).select());
  res.json(updated);
});

router.delete('/projects/:id', requireAuth, requireRole('faculty'), async (req, res) => {
  const project = unwrap(await supabase.from('research_projects').select('*').eq('id', req.params.id).maybeSingle());
  if (!project) return res.status(404).json({ error: 'project not found' });
  if (project.faculty_id !== req.user.id) return res.status(403).json({ error: 'not your project' });
  if (!(await requireFacultyProjectsUnlocked(project.faculty_id, res))) return;
  const application = unwrap(await supabase.from('research_applications').select('id').eq('project_id', project.id).limit(1).maybeSingle());
  if (application) return res.status(409).json({ error: 'this project has student applications and cannot be deleted' });
  unwrap(await supabase.from('research_projects').delete().eq('id', project.id));
  await logAudit({ actorId: req.user.id, actorRole: 'faculty', action: 'delete_research_project', entityType: 'research_projects', entityId: project.id, oldValue: project });
  res.status(204).end();
});

// ---------- applications ----------

const applicationSchema = z.object({ project_id: z.string().uuid() });

router.post('/applications', requireAuth, requireRole('student'), async (req, res) => {
  const parsed = applicationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!(await requireStudentPortalUnlocked(req, res))) return;
  const project = unwrap(await supabase.from('research_projects').select('id,faculty_id,status,approved_count,max_students').eq('id', parsed.data.project_id).maybeSingle());
  if (!project || !['open', 'locked'].includes(project.status) || project.approved_count >= project.max_students) return res.status(400).json({ error: 'project is not accepting applications' });
  if (!(await requireFacultyProjectsUnlocked(project.faculty_id, res))) return;
  const approvedInternship = await findApprovedInternship(req.user.id);
  if (approvedInternship) return res.status(409).json({ error: `your approved ${approvedInternship.track} already occupies your exclusive internship track` });
  const duplicate = unwrap(await supabase.from('research_applications').select('id').eq('student_id', req.user.id).eq('project_id', project.id).maybeSingle());
  if (duplicate) return res.status(409).json({ error: 'you already applied to this project' });
  const [application] = unwrap(await supabase.from('research_applications').insert({
    student_id: req.user.id, project_id: parsed.data.project_id,
  }).select());
  res.status(201).json(application);
});

const decisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  reason: z.string().optional(),
}).superRefine((value, context) => {
  if (value.decision === 'reject' && !value.reason?.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'A rejection reason is required.' });
  }
});

router.patch('/applications/:id/faculty-decision', requireAuth, requireRole('faculty'), async (req, res) => {
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { decision, reason } = parsed.data;

  const application = unwrap(await supabase.from('research_applications').select('*').eq('id', req.params.id).maybeSingle());
  if (!application) return res.status(404).json({ error: 'not found' });
  const project = unwrap(await supabase.from('research_projects').select('faculty_id').eq('id', application.project_id).maybeSingle());
  if (!project || project.faculty_id !== req.user.id) return res.status(403).json({ error: 'not your project' });
  if (!(await requireFacultyProjectsUnlocked(project.faculty_id, res))) return;

  if (application.status !== 'pending_faculty') return res.status(400).json({ error: `cannot decide from status ${application.status}` });
  const now = new Date().toISOString();
  const update = decision === 'approve'
    ? { status: 'pending_crcs_approval', faculty_decision_by: req.user.id, faculty_decision_at: now }
    : { status: 'rejected', faculty_decision_by: req.user.id, faculty_decision_at: now, rejection_reason: reason ?? null, rejected_by_role: 'faculty', rejected_at_stage: 'faculty' };
  const [updated] = unwrap(await supabase.from('research_applications').update(update).eq('id', application.id).select());
  await notify({ userId: application.student_id, title: `Research application ${decision === 'approve' ? 'sent to CRCS' : 'rejected'}`, body: reason ?? null, relatedEntityType: 'research_application', relatedEntityId: application.id });
  await logAudit({ actorId: req.user.id, actorRole: 'faculty', action: `faculty_${decision}_research_application`, entityType: 'research_applications', entityId: application.id, oldValue: { status: application.status }, newValue: update });
  res.json(updated);
});

router.patch('/applications/:id/withdraw', requireAuth, requireRole('student'), async (req, res) => {
  if (!(await requireStudentPortalUnlocked(req, res))) return;
  const application = unwrap(await supabase.from('research_applications').select('*').eq('id', req.params.id).maybeSingle());
  if (!application) return res.status(404).json({ error: 'application not found' });
  if (application.student_id !== req.user.id) return res.status(403).json({ error: 'forbidden' });
  if (!['pending_faculty', 'pending_crcs_approval'].includes(application.status)) return res.status(409).json({ error: 'only a pending research application can be revoked' });
  const now = new Date().toISOString();
  const [updated] = unwrap(await supabase.from('research_applications').update({ status: 'revoked', rejection_reason: 'Withdrawn by student.', updated_at: now }).eq('id', application.id).select());
  await logAudit({ actorId: req.user.id, actorRole: 'student', action: 'withdraw_research_application', entityType: 'research_applications', entityId: application.id, oldValue: { status: application.status }, newValue: { status: 'revoked', reason: 'Withdrawn by student.' } });
  res.json(updated);
});

router.patch('/applications/:id/crcs-decision', requireAuth, requireRole('crcs_superadmin', 'crcs_coordinator'), requireCrcsPermission('view_research_approvals'), async (req, res) => {
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { decision, reason } = parsed.data;
  const application = unwrap(await supabase.from('research_applications').select('*').eq('id', req.params.id).maybeSingle());
  if (!application) return res.status(404).json({ error: 'not found' });
  if (application.status !== 'pending_crcs_approval') return res.status(400).json({ error: `cannot decide from status ${application.status}` });
  const actorRole = req.user.roles.find((role) => ['crcs_superadmin', 'crcs_coordinator'].includes(role.role)).role;
  const now = new Date().toISOString();
  if (decision === 'reject') {
    const [updated] = unwrap(await supabase.from('research_applications').update({ status: 'rejected', crcs_decision_by: req.user.id, crcs_decision_at: now, rejection_reason: reason ?? null, rejected_by_role: actorRole, rejected_at_stage: 'crcs' }).eq('id', application.id).select());
    await notify({ userId: application.student_id, title: 'Research application rejected by CRCS', body: reason ?? null, relatedEntityType: 'research_application', relatedEntityId: application.id });
    return res.json(updated);
  }
  const project = unwrap(await supabase.from('research_projects').select('*').eq('id', application.project_id).maybeSingle());
  if (!project || project.status === 'full' || project.approved_count >= project.max_students) return res.status(409).json({ error: 'project has no remaining places' });
  const approvedInternship = await findApprovedInternship(application.student_id);
  if (approvedInternship) return res.status(409).json({ error: `student already has an approved ${approvedInternship.track}` });
  const [updated] = unwrap(await supabase.from('research_applications').update({ status: 'crcs_approved', crcs_decision_by: req.user.id, crcs_decision_at: now }).eq('id', application.id).select());
  const count = project.approved_count + 1;
  unwrap(await supabase.from('research_projects').update({ approved_count: count, status: count >= project.max_students ? 'full' : 'locked', locked_at: project.locked_at ?? now, updated_at: now }).eq('id', project.id));
  const existing = unwrap(await supabase.from('mentor_assignments').select('id').eq('research_application_id', application.id).maybeSingle());
  if (!existing) unwrap(await supabase.from('mentor_assignments').insert({ student_id: application.student_id, research_application_id: application.id, faculty_id: project.faculty_id, is_current: true, reassigned_by: req.user.id }));
  await closeCompetingApplications(application.student_id, 'research internship', now);
  await notify({ userId: application.student_id, title: 'Research internship approved', relatedEntityType: 'research_application', relatedEntityId: application.id });
  await logAudit({ actorId: req.user.id, actorRole, action: 'crcs_approve_research_application', entityType: 'research_applications', entityId: application.id, oldValue: { status: application.status }, newValue: { status: 'crcs_approved' } });
  res.json(updated);
});

// ---------- mentor reassignment ----------

const reassignSchema = z.object({ new_faculty_id: z.string().uuid(), reason: z.string().min(1) });

router.get('/mentor-assignments', requireAuth, requireRole('faculty_coordinator', 'crcs_superadmin'), async (req, res) => {
  let scopedFacultyIds = null;
  if (req.user.roles.some((role) => role.role === 'faculty_coordinator') && !req.user.roles.some((role) => role.role === 'crcs_superadmin')) {
    const scoped = unwrap(await supabase.from('faculty_coordinator_assignments').select('faculty_id').eq('coordinator_id', req.user.id));
    scopedFacultyIds = scoped.map((row) => row.faculty_id);
  }
  let assignmentsQuery = supabase.from('mentor_assignments').select('*').eq('is_current', true).order('started_at', { ascending: false });
  if (scopedFacultyIds) {
    if (!scopedFacultyIds.length) return res.json({ assignments: [], faculty: [] });
    assignmentsQuery = assignmentsQuery.in('faculty_id', scopedFacultyIds);
  }
  const assignments = unwrap(await assignmentsQuery);
  const studentIds = [...new Set(assignments.map((row) => row.student_id))];
  const currentFacultyIds = [...new Set(assignments.map((row) => row.faculty_id))];
  const currentFaculty = currentFacultyIds.length ? unwrap(await supabase.from('faculty').select('id,department_id').in('id', currentFacultyIds)) : [];
  const departmentIds = [...new Set(currentFaculty.map((row) => row.department_id))];
  let facultyQuery = supabase.from('faculty').select('id,department_id');
  if (departmentIds.length) facultyQuery = facultyQuery.in('department_id', departmentIds);
  const availableFaculty = departmentIds.length ? unwrap(await facultyQuery) : [];
  const userIds = [...new Set([...studentIds, ...availableFaculty.map((row) => row.id)])];
  const users = userIds.length ? unwrap(await supabase.from('users').select('id,full_name,email').in('id', userIds)) : [];
  const userById = Object.fromEntries(users.map((user) => [user.id, user]));
  res.json({
    assignments: assignments.map((row) => ({ ...row, student: userById[row.student_id] ?? null, faculty: userById[row.faculty_id] ?? null })),
    faculty: availableFaculty.map((row) => ({ ...row, user: userById[row.id] ?? null })),
  });
});

router.post('/mentor-assignments/:id/reassign', requireAuth, requireRole('faculty_coordinator', 'crcs_superadmin'), async (req, res) => {
  const parsed = reassignSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { new_faculty_id, reason } = parsed.data;

  if (req.user.roles.some((r) => r.role === 'faculty_coordinator')) {
    const current = unwrap(await supabase.from('mentor_assignments').select('faculty_id').eq('id', req.params.id).eq('is_current', true).maybeSingle());
    if (!current) return res.status(404).json({ error: 'active mentor assignment not found' });
    const assigned = unwrap(await supabase.from('faculty_coordinator_assignments').select('id').eq('coordinator_id', req.user.id).eq('faculty_id', current.faculty_id).maybeSingle());
    if (!assigned) return res.status(403).json({ error: 'faculty is outside your assigned scope' });
  }

  const current = unwrap(await supabase.from('mentor_assignments').select('*').eq('id', req.params.id).eq('is_current', true).maybeSingle());
  if (!current) return res.status(404).json({ error: 'active mentor assignment not found' });
  const nextMentor = unwrap(await supabase.from('faculty').select('id').eq('id', new_faculty_id).maybeSingle());
  if (!nextMentor) return res.status(400).json({ error: 'new mentor is not a faculty member' });
  const now = new Date().toISOString();
  unwrap(await supabase.from('mentor_assignments').update({ is_current: false, ended_at: now }).eq('id', current.id));
  const [created] = unwrap(await supabase.from('mentor_assignments').insert({ student_id: current.student_id, research_application_id: current.research_application_id, faculty_id: new_faculty_id, is_current: true, reassigned_from: current.id, reassigned_by: req.user.id, reassignment_reason: reason }).select());
  await logAudit({ actorId: req.user.id, actorRole: req.user.roles[0]?.role, action: 'reassign_mentor', entityType: 'mentor_assignments', entityId: created.id, oldValue: { faculty_id: current.faculty_id }, newValue: { faculty_id: new_faculty_id, reason } });
  res.status(201).json(created);
});

// ---------- attendance ----------

const attendanceSchema = z.object({
  mentor_assignment_id: z.string().uuid(),
  week_number: z.number().int().min(1),
  present: z.boolean(),
});

router.post('/attendance', requireAuth, requireRole('faculty'), async (req, res) => {
  if (!(await requireFacultyAssignmentsUnlocked(req.user.id, res))) return;
  const parsed = attendanceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { mentor_assignment_id, week_number, present } = parsed.data;

  const assignment = unwrap(await supabase.from('mentor_assignments').select('faculty_id').eq('id', mentor_assignment_id).maybeSingle());
  if (!assignment) return res.status(404).json({ error: 'mentor assignment not found' });
  if (assignment.faculty_id !== req.user.id) return res.status(403).json({ error: 'not your mentee' });

  const [attendance] = unwrap(await supabase.from('weekly_attendance')
    .upsert({ mentor_assignment_id, week_number, present, marked_by: req.user.id, marked_at: new Date().toISOString() }, { onConflict: 'mentor_assignment_id,week_number' })
    .select());
  res.status(201).json(attendance);
});

// ---------- dashboard ----------

router.get('/dashboard/:student_id', requireAuth, async (req, res) => {
  const { student_id } = req.params;
  const { departmentIds, schoolIds, isSystemWide } = scopeToDepartment(req);

  const isSelf = req.user.id === student_id;
  const isCrcs = req.user.roles.some((r) => ['crcs_superadmin', 'crcs_coordinator'].includes(r.role));
  if (!isSelf && !isCrcs && !isSystemWide) {
    const student = unwrap(await supabase.from('students').select('department_id').eq('id', student_id).maybeSingle());
    if (!student) return res.status(404).json({ error: 'student not found' });
    let inScope = !!(departmentIds && departmentIds.includes(student.department_id));
    if (!inScope && schoolIds) {
      const dept = unwrap(await supabase.from('departments').select('id').eq('id', student.department_id).in('school_id', schoolIds).maybeSingle());
      inScope = !!dept;
    }
    const mentor = unwrap(await supabase.from('mentor_assignments').select('id').eq('student_id', student_id).eq('faculty_id', req.user.id).eq('is_current', true).maybeSingle());
    if (!inScope && !mentor) return res.status(403).json({ error: 'out of scope' });
  }

  const mentorAssignment = unwrap(await supabase.from('mentor_assignments').select('*').eq('student_id', student_id).eq('is_current', true).maybeSingle());
  let mentor = null;
  if (mentorAssignment) {
    const [facultyUserResult, facultyProfileResult] = await Promise.all([
      supabase.from('users').select('id,full_name,email,phone').eq('id', mentorAssignment.faculty_id).maybeSingle(),
      supabase.from('faculty').select('id,cabin').eq('id', mentorAssignment.faculty_id).maybeSingle(),
    ]);
    const facultyUser = unwrap(facultyUserResult);
    const facultyProfile = unwrap(facultyProfileResult);
    mentor = facultyUser ? { ...facultyUser, cabin: facultyProfile?.cabin ?? null } : null;
  }

  const researchApplications = unwrap(await supabase.from('research_applications').select('*').eq('student_id', student_id).order('updated_at', { ascending: false }));
  const projectIds = [...new Set(researchApplications.map((item) => item.project_id).filter(Boolean))];
  const projects = projectIds.length
    ? unwrap(await supabase.from('research_projects').select('id,title,description').in('id', projectIds))
    : [];
  const projectById = Object.fromEntries(projects.map((project) => [project.id, project]));
  const applications = researchApplications.map((item) => ({ ...item, ...(projectById[item.project_id] ?? {}) }));
  const application = applications.find((item) => item.status === 'crcs_approved')
    ?? applications.find((item) => !['rejected', 'revoked'].includes(item.status))
    ?? applications[0]
    ?? null;

  const documents = application
    ? unwrap(await supabase.from('documents').select('*').eq('related_entity_type', 'research_application').eq('related_entity_id', application.id).order('uploaded_at', { ascending: false }))
    : [];
  const attendance = mentorAssignment
    ? unwrap(await supabase.from('weekly_attendance').select('*').eq('mentor_assignment_id', mentorAssignment.id).order('week_number'))
    : [];

  res.json({
    mentorAssignment: mentorAssignment ? { ...mentorAssignment, faculty_name: mentor?.full_name ?? null, mentor } : null,
    application,
    applications,
    documents,
    attendance,
  });
});

export default router;
