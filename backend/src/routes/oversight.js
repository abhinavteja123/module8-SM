import { Router } from 'express';
import { z } from 'zod';
import { supabase, unwrap } from '../db/client.js';
import { requireAuth, requireRole, requireCrcsPermission, scopeToDepartment } from '../middleware/auth.js';
import { requireVisibleCycle } from '../lib/cycleVisibility.js';
import { directoryPage } from '../lib/directoryPage.js';

const router = Router();

const ACTIVITY_ROLES = ['hod', 'dean', 'school_office', 'faculty_coordinator', 'crcs_coordinator', 'crcs_superadmin'];

// A Faculty Coordinator's monitoring scope is deliberately narrower than HOD's: only the
// specific faculty CRCS mapped to them (faculty_coordinator_assignments, capped at 10 by
// design), plus those faculty's current mentees — not the whole department.
function isScopedFacultyCoordinator(req) {
  const roles = req.user.roles.map((role) => role.role);
  return roles.includes('faculty_coordinator') && !roles.some((role) => ['hod', 'dean', 'school_office', 'crcs_coordinator', 'crcs_superadmin'].includes(role));
}

async function facultyCoordinatorFacultyIds(coordinatorId) {
  const rows = unwrap(await supabase.from('faculty_coordinator_assignments').select('faculty_id').eq('coordinator_id', coordinatorId));
  return [...new Set(rows.map((row) => row.faculty_id))];
}

async function facultyCoordinatorStudentIds(facultyIds, cycleId) {
  if (!facultyIds.length) return [];
  const [research, opportunity, self] = await Promise.all([
    supabase.from('mentor_assignments').select('student_id').in('faculty_id', facultyIds).eq('is_current', true).then(unwrap),
    supabase.from('opportunity_applications').select('student_id').in('assigned_mentor_id', facultyIds).eq('status', 'crcs_approved').then(unwrap),
    supabase.from('self_internships').select('student_id').in('assigned_mentor_id', facultyIds).eq('status', 'active').eq('cycle_id', cycleId).then(unwrap),
  ]);
  return [...new Set([...research.map((row) => row.student_id), ...opportunity.map((row) => row.student_id), ...self.map((row) => row.student_id)])];
}

// Same output contract as directoryPage({items,total,page,page_size}, each item carrying
// a `.roles` array) but restricted to an explicit id list instead of a department/school —
// the Faculty Coordinator's mapped-faculty scope has no department-wide equivalent query.
async function pageFromIds(cycleId, ids, params) {
  const empty = { items: [], total: 0, page: params.page, page_size: params.page_size };
  if (!ids.length) return empty;
  const enrolled = unwrap(await supabase.from('cycle_participants').select('user_id').eq('cycle_id', cycleId).eq('participant_type', params.role).in('user_id', ids));
  const enrolledIds = new Set(enrolled.map((row) => row.user_id));
  const scopedIds = ids.filter((id) => enrolledIds.has(id));
  if (!scopedIds.length) return empty;
  const rows = unwrap(await supabase.from('users').select('id,email,full_name,phone,is_active,created_at,roles:user_roles!inner(role,department_id,school_id)')
    .eq('roles.role', params.role).in('id', scopedIds).order('full_name'));
  const needle = params.search.trim().toLowerCase();
  const filtered = needle ? rows.filter((row) => `${row.full_name} ${row.email}`.toLowerCase().includes(needle)) : rows;
  const total = filtered.length;
  const start = (params.page - 1) * params.page_size;
  const pageRows = filtered.slice(start, start + params.page_size);
  const pageIds = pageRows.map((row) => row.id);
  const extraRows = pageIds.length
    ? unwrap(await supabase.from(params.role === 'student' ? 'students' : 'faculty').select(params.role === 'student' ? 'id,roll_number' : 'id,mentorship_scope,cabin').in('id', pageIds))
    : [];
  const extraById = Object.fromEntries(extraRows.map((row) => [row.id, row]));
  return { items: pageRows.map((row) => ({ ...row, ...(extraById[row.id] ?? {}) })), total, page: params.page, page_size: params.page_size };
}

async function canViewActivityDetail(req, personType, targetId, cycleId) {
  const roles = req.user.roles.map((role) => role.role);
  if (roles.some((role) => ['crcs_superadmin', 'crcs_coordinator'].includes(role))) return true;
  if (isScopedFacultyCoordinator(req)) {
    const facultyIds = await facultyCoordinatorFacultyIds(req.user.id);
    if (personType === 'faculty') return facultyIds.includes(targetId);
    return (await facultyCoordinatorStudentIds(facultyIds, cycleId)).includes(targetId);
  }
  const scope = scopeToDepartment(req);
  const target = unwrap(await supabase.from(personType === 'student' ? 'students' : 'faculty').select('department_id, departments(school_id)').eq('id', targetId).maybeSingle());
  if (!target) return false;
  if (scope.departmentIds?.includes(target.department_id)) return true;
  if (scope.schoolIds?.includes(target.departments?.school_id)) return true;
  return false;
}

async function studentApplicationsDetail(studentId) {
  const [research, opportunity, self] = await Promise.all([
    supabase.from('research_applications').select('id,project_id,status,created_at').eq('student_id', studentId).then(unwrap),
    supabase.from('opportunity_applications').select('id,opportunity_id,status,created_at').eq('student_id', studentId).then(unwrap),
    supabase.from('self_internships').select('id,company_name,status,created_at').eq('student_id', studentId).then(unwrap),
  ]);
  const projectIds = research.map((row) => row.project_id);
  const opportunityIds = opportunity.map((row) => row.opportunity_id);
  const [projects, opportunities] = await Promise.all([
    projectIds.length ? supabase.from('research_projects').select('id,title').in('id', projectIds).then(unwrap) : [],
    opportunityIds.length ? supabase.from('crcs_opportunities').select('id,title').in('id', opportunityIds).then(unwrap) : [],
  ]);
  const projectById = Object.fromEntries(projects.map((row) => [row.id, row.title]));
  const opportunityById = Object.fromEntries(opportunities.map((row) => [row.id, row.title]));
  return [
    ...research.map((row) => ({ id: row.id, type: 'research', title: projectById[row.project_id] ?? 'Research project', status: row.status, created_at: row.created_at })),
    ...opportunity.map((row) => ({ id: row.id, type: 'crcs_opportunity', title: opportunityById[row.opportunity_id] ?? 'CRCS opportunity', status: row.status, created_at: row.created_at })),
    ...self.map((row) => ({ id: row.id, type: 'self_internship', title: row.company_name, status: row.status, created_at: row.created_at })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

async function facultyActivityDetail(facultyId, cycleId) {
  const [projects, research, opportunity, self] = await Promise.all([
    supabase.from('research_projects').select('id,title,status,approved_count,max_students,created_at').eq('faculty_id', facultyId).eq('cycle_id', cycleId).order('created_at', { ascending: false }).then(unwrap),
    supabase.from('mentor_assignments').select('student_id').eq('faculty_id', facultyId).eq('is_current', true).then(unwrap),
    supabase.from('opportunity_applications').select('student_id').eq('assigned_mentor_id', facultyId).eq('status', 'crcs_approved').then(unwrap),
    supabase.from('self_internships').select('student_id').eq('assigned_mentor_id', facultyId).eq('status', 'active').then(unwrap),
  ]);
  const mentees = [
    ...research.map((row) => ({ student_id: row.student_id, pathway: 'research' })),
    ...opportunity.map((row) => ({ student_id: row.student_id, pathway: 'crcs_opportunity' })),
    ...self.map((row) => ({ student_id: row.student_id, pathway: 'self_internship' })),
  ];
  const studentIds = [...new Set(mentees.map((row) => row.student_id))];
  const students = studentIds.length ? unwrap(await supabase.from('users').select('id,full_name,email').in('id', studentIds)) : [];
  const studentById = Object.fromEntries(students.map((row) => [row.id, row]));
  return { projects, mentees: mentees.map((row) => ({ ...row, student: studentById[row.student_id] ?? null })) };
}

async function mentorLoadByFacultyIds(facultyIds) {
  if (!facultyIds.length) return {};
  const [research, opportunity, self] = await Promise.all([
    supabase.from('mentor_assignments').select('faculty_id').in('faculty_id', facultyIds).eq('is_current', true),
    supabase.from('opportunity_applications').select('assigned_mentor_id').in('assigned_mentor_id', facultyIds).eq('status', 'crcs_approved'),
    supabase.from('self_internships').select('assigned_mentor_id').in('assigned_mentor_id', facultyIds).eq('status', 'active'),
  ]);
  const counts = Object.fromEntries(facultyIds.map((id) => [id, 0]));
  for (const row of unwrap(research)) counts[row.faculty_id] = (counts[row.faculty_id] ?? 0) + 1;
  for (const row of unwrap(opportunity)) counts[row.assigned_mentor_id] = (counts[row.assigned_mentor_id] ?? 0) + 1;
  for (const row of unwrap(self)) counts[row.assigned_mentor_id] = (counts[row.assigned_mentor_id] ?? 0) + 1;
  return counts;
}

// One read-only hierarchy overview endpoint for HOD (department scope) and Dean/School Office
// (school scope, broken down per department) — the oversight roles that manage people, not
// applications. CRCS Superadmin uses the existing system-wide admin surfaces instead.
router.get('/oversight/overview', requireAuth, requireRole('hod', 'dean', 'school_office'), async (req, res) => {
  const parsed = z.object({ cycle_id: z.string().uuid().optional() }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const cycle = parsed.data.cycle_id ? await requireVisibleCycle(req, res, parsed.data.cycle_id) : null;
  if (parsed.data.cycle_id && !cycle) return;
  const participantRows = cycle
    ? unwrap(await supabase.from('cycle_participants').select('user_id').eq('cycle_id', cycle.id))
    : null;
  const participantIds = participantRows ? new Set(participantRows.map((row) => row.user_id)) : null;
  const roles = req.user.roles;
  const hodRole = roles.find((role) => role.role === 'hod' && role.department_id);
  const isSchoolScope = roles.some((role) => ['dean', 'school_office'].includes(role.role));

  if (hodRole && !isSchoolScope) {
    const departmentId = hodRole.department_id;
    const department = unwrap(await supabase.from('departments').select('id,name,code,school_id').eq('id', departmentId).maybeSingle());
    const school = department?.school_id ? unwrap(await supabase.from('schools').select('id,name,code').eq('id', department.school_id).maybeSingle()) : null;
    const [facultyRoles, coordinatorRoles, studentProfiles, assignments] = await Promise.all([
      supabase.from('user_roles').select('user_id').eq('role', 'faculty').eq('department_id', departmentId),
      supabase.from('user_roles').select('user_id').eq('role', 'faculty_coordinator').eq('department_id', departmentId),
      supabase.from('students').select('id').eq('department_id', departmentId),
      supabase.from('faculty_coordinator_assignments').select('coordinator_id,faculty_id').eq('department_id', departmentId),
    ]);
    const facultyIds = unwrap(facultyRoles).map((row) => row.user_id).filter((id) => !participantIds || participantIds.has(id));
    const coordinatorIds = new Set(unwrap(coordinatorRoles).map((row) => row.user_id).filter((id) => !participantIds || participantIds.has(id)));
    const facultyOnlyIds = facultyIds.filter((id) => !coordinatorIds.has(id));
    const allPersonIds = [...new Set([...facultyIds, ...coordinatorIds])];
    const [people, facultyProfiles, mentorLoad] = await Promise.all([
      allPersonIds.length ? supabase.from('users').select('id,full_name,email,phone,is_active').in('id', allPersonIds) : { data: [] },
      allPersonIds.length ? supabase.from('faculty').select('id,mentorship_scope,cabin').in('id', allPersonIds) : { data: [] },
      mentorLoadByFacultyIds(facultyOnlyIds),
    ]);
    const personById = Object.fromEntries(unwrap(people).map((person) => [person.id, person]));
    const facultyProfileById = Object.fromEntries(unwrap(facultyProfiles).map((profile) => [profile.id, profile]));
    const assignmentByFaculty = Object.fromEntries(unwrap(assignments).map((row) => [row.faculty_id, row.coordinator_id]));
    const faculty = facultyOnlyIds.filter((id) => personById[id]).map((id) => ({
      ...personById[id], mentorship_scope: facultyProfileById[id]?.mentorship_scope ?? null, cabin: facultyProfileById[id]?.cabin ?? null,
      active_mentees: mentorLoad[id] ?? 0, coordinator: assignmentByFaculty[id] ? personById[assignmentByFaculty[id]] ?? null : null,
    }));
    const coordinators = [...coordinatorIds].filter((id) => personById[id]).map((id) => ({
      ...personById[id],
      assigned_faculty_count: unwrap(assignments).filter((row) => row.coordinator_id === id).length,
    }));
    return res.json({
      scope: 'department', department, school,
      cycle: cycle ?? null,
      totals: { faculty: faculty.length, students: unwrap(studentProfiles).filter((row) => !participantIds || participantIds.has(row.id)).length, coordinators: coordinators.length },
      faculty, coordinators,
    });
  }

  // Dean / School Office: school-wide, one row per department.
  const schoolRole = roles.find((role) => ['dean', 'school_office'].includes(role.role) && role.school_id);
  if (!schoolRole) return res.status(400).json({ error: 'your account has no school assigned yet' });
  const schoolId = schoolRole.school_id;
  const school = unwrap(await supabase.from('schools').select('id,name,code').eq('id', schoolId).maybeSingle());
  const departments = unwrap(await supabase.from('departments').select('id,name,code').eq('school_id', schoolId).order('name'));
  const departmentIds = departments.map((department) => department.id);
  if (!departmentIds.length) return res.json({ scope: 'school', school, totals: { departments: 0, faculty: 0, students: 0, coordinators: 0 }, departments: [] });
  const [hodRoles, facultyRoles, coordinatorRoles, studentProfiles] = await Promise.all([
    supabase.from('user_roles').select('user_id,department_id').eq('role', 'hod').in('department_id', departmentIds),
    supabase.from('user_roles').select('user_id,department_id').eq('role', 'faculty').in('department_id', departmentIds),
    supabase.from('user_roles').select('user_id,department_id').eq('role', 'faculty_coordinator').in('department_id', departmentIds),
    supabase.from('students').select('id,department_id').in('department_id', departmentIds),
  ]);
  const hodByDept = Object.fromEntries(unwrap(hodRoles).filter((row) => !participantIds || participantIds.has(row.user_id)).map((row) => [row.department_id, row.user_id]));
  const hodIds = Object.values(hodByDept);
  const people = hodIds.length ? unwrap(await supabase.from('users').select('id,full_name,email').in('id', hodIds)) : [];
  const personById = Object.fromEntries(people.map((person) => [person.id, person]));
  const facultyByDept = {};
  unwrap(facultyRoles).filter((row) => !participantIds || participantIds.has(row.user_id)).forEach((row) => { facultyByDept[row.department_id] = (facultyByDept[row.department_id] ?? 0) + 1; });
  const coordinatorByDept = {};
  unwrap(coordinatorRoles).filter((row) => !participantIds || participantIds.has(row.user_id)).forEach((row) => { coordinatorByDept[row.department_id] = (coordinatorByDept[row.department_id] ?? 0) + 1; });
  const studentByDept = {};
  unwrap(studentProfiles).filter((row) => !participantIds || participantIds.has(row.id)).forEach((row) => { studentByDept[row.department_id] = (studentByDept[row.department_id] ?? 0) + 1; });
  const departmentRows = departments.map((department) => ({
    department, hod: personById[hodByDept[department.id]] ?? null,
    faculty_count: facultyByDept[department.id] ?? 0, student_count: studentByDept[department.id] ?? 0, coordinator_count: coordinatorByDept[department.id] ?? 0,
  }));
  res.json({
    scope: 'school', school, cycle: cycle ?? null,
    totals: {
      departments: departments.length,
      faculty: departmentRows.reduce((sum, row) => sum + row.faculty_count, 0),
      students: departmentRows.reduce((sum, row) => sum + row.student_count, 0),
      coordinators: departmentRows.reduce((sum, row) => sum + row.coordinator_count, 0),
    },
    departments: departmentRows,
  });
});

// Activity monitor: is this person actually using the portal, not just enrolled in it.
// Scope/pagination is delegated entirely to directoryPage — same scoped, bounded,
// searchable primitive admin/student-records already uses — so this route only adds
// per-page enrichment queries bounded by the page's ids, never the whole directory.
const activityQuerySchema = z.object({
  cycle_id: z.string().uuid(),
  person_type: z.enum(['faculty', 'student']),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).default(''),
  department_id: z.string().uuid().optional(),
  school_id: z.string().uuid().optional(),
  login_status: z.enum(['logged_in', 'never']).optional(),
  pathway: z.enum(['research', 'crcs_opportunity', 'self_internship', 'none']).optional(),
  activity: z.enum(['active', 'none']).optional(),
});

// ponytail: login/pathway/activity can't be pushed into directoryPage's SQL without a
// join it doesn't do, so filtering+pagination on them requires seeing the whole scoped
// population first. Bounded scan capped here; raise the cap or move these into SQL if a
// school/system-wide search combined with a filter regularly needs more than this.
const CANDIDATE_SCAN_CAP = 2000;

async function scopedCandidates(req, cycle, personType, filters) {
  if (isScopedFacultyCoordinator(req)) {
    const facultyIds = await facultyCoordinatorFacultyIds(req.user.id);
    const ids = personType === 'faculty' ? facultyIds : await facultyCoordinatorStudentIds(facultyIds, cycle.id);
    const page = await pageFromIds(cycle.id, ids, { page: 1, page_size: Math.max(ids.length, 1), search: filters.search, role: personType });
    return page.items;
  }
  const collected = [];
  let page = 1;
  for (;;) {
    const batch = await directoryPage(req, cycle.id, { page, page_size: 200, search: filters.search, role: personType, department_id: filters.department_id, school_id: filters.school_id });
    collected.push(...batch.items);
    if (!batch.items.length || collected.length >= batch.total || collected.length >= CANDIDATE_SCAN_CAP) break;
    page += 1;
  }
  return collected;
}

async function enrichPeople(personType, people, cycleId) {
  const ids = people.map((item) => item.id);
  if (!ids.length) return [];
  const departmentIds = [...new Set(people.flatMap((item) => item.roles.map((role) => role.department_id).filter(Boolean)))];
  const [loginRows, auditRows, departmentRows] = await Promise.all([
    supabase.from('users').select('id,last_login_at').in('id', ids).then(unwrap),
    // Ordered desc and reduced to first-per-actor below, so this reflects the person's
    // most recent recorded write — a partial signal (only audit-logged actions), not
    // full activity coverage; label it "last recorded action" in the UI, never "active".
    supabase.from('audit_log').select('actor_id,action,created_at').in('actor_id', ids).order('created_at', { ascending: false }).then(unwrap),
    departmentIds.length ? supabase.from('departments').select('id,name').in('id', departmentIds).then(unwrap) : [],
  ]);
  const loginById = Object.fromEntries(loginRows.map((row) => [row.id, row.last_login_at]));
  const departmentById = Object.fromEntries(departmentRows.map((row) => [row.id, row.name]));
  const lastActionById = {};
  auditRows.forEach((row) => { if (!lastActionById[row.actor_id]) lastActionById[row.actor_id] = row; });
  const departmentFor = (item, role) => departmentById[item.roles.find((r) => r.role === role)?.department_id] ?? null;
  const actionFor = (id) => lastActionById[id] ? { action: lastActionById[id].action, at: lastActionById[id].created_at } : null;

  if (personType === 'faculty') {
    const [projects, mentorLoad] = await Promise.all([
      supabase.from('research_projects').select('faculty_id,created_at').eq('cycle_id', cycleId).in('faculty_id', ids).order('created_at', { ascending: false }).then(unwrap),
      mentorLoadByFacultyIds(ids),
    ]);
    const postedById = {};
    const latestPostById = {};
    projects.forEach((row) => { postedById[row.faculty_id] = (postedById[row.faculty_id] ?? 0) + 1; if (!latestPostById[row.faculty_id]) latestPostById[row.faculty_id] = row.created_at; });
    return people.map((item) => ({
      id: item.id, full_name: item.full_name, email: item.email, department: departmentFor(item, 'faculty'),
      mentorship_scope: item.mentorship_scope, last_login_at: loginById[item.id] ?? null,
      active_mentees: mentorLoad[item.id] ?? 0,
      research_projects_posted: postedById[item.id] ?? 0, latest_research_posted_at: latestPostById[item.id] ?? null,
      last_recorded_action: actionFor(item.id),
    }));
  }

  const [researchApps, opportunityApps, selfInternships, trackSelections] = await Promise.all([
    supabase.from('research_applications').select('student_id,created_at').in('student_id', ids).then(unwrap),
    supabase.from('opportunity_applications').select('student_id,created_at').in('student_id', ids).then(unwrap),
    supabase.from('self_internships').select('student_id,created_at').in('student_id', ids).then(unwrap),
    supabase.from('student_track_selections').select('student_id,track').eq('cycle_id', cycleId).in('student_id', ids).then(unwrap),
  ]);
  const countById = {};
  const latestAppById = {};
  [...researchApps, ...opportunityApps, ...selfInternships].forEach((row) => {
    countById[row.student_id] = (countById[row.student_id] ?? 0) + 1;
    if (!latestAppById[row.student_id] || row.created_at > latestAppById[row.student_id]) latestAppById[row.student_id] = row.created_at;
  });
  const trackById = Object.fromEntries(trackSelections.map((row) => [row.student_id, row.track]));
  return people.map((item) => ({
    id: item.id, full_name: item.full_name, email: item.email, roll_number: item.roll_number, department: departmentFor(item, 'student'),
    last_login_at: loginById[item.id] ?? null, track_selected: trackById[item.id] ?? null,
    applications_count: countById[item.id] ?? 0, latest_application_at: latestAppById[item.id] ?? null,
    last_recorded_action: actionFor(item.id),
  }));
}

router.get('/oversight/activity', requireAuth, requireRole(...ACTIVITY_ROLES), requireCrcsPermission('view_analytics'), async (req, res) => {
  const parsed = activityQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const cycle = await requireVisibleCycle(req, res, parsed.data.cycle_id, { mode: 'read' });
  if (!cycle) return;
  const { person_type: personType, page: pageNum, page_size: pageSize, search, department_id: departmentId, school_id: schoolId, login_status: loginStatus, pathway, activity } = parsed.data;
  const hasExtraFilter = Boolean(loginStatus || pathway || activity);

  if (!hasExtraFilter) {
    const page = isScopedFacultyCoordinator(req)
      ? await pageFromIds(cycle.id, personType === 'faculty'
          ? await facultyCoordinatorFacultyIds(req.user.id)
          : await facultyCoordinatorStudentIds(await facultyCoordinatorFacultyIds(req.user.id), cycle.id),
        { page: pageNum, page_size: pageSize, search, role: personType })
      : await directoryPage(req, cycle.id, { page: pageNum, page_size: pageSize, search, role: personType, department_id: departmentId, school_id: schoolId });
    const items = await enrichPeople(personType, page.items, cycle.id);
    return res.json({ cycle, person_type: personType, items, total: page.total, page: page.page, page_size: page.page_size });
  }

  const candidates = await scopedCandidates(req, cycle, personType, { search, department_id: departmentId, school_id: schoolId });
  let items = await enrichPeople(personType, candidates, cycle.id);
  if (loginStatus) items = items.filter((item) => loginStatus === 'logged_in' ? item.last_login_at : !item.last_login_at);
  if (pathway && personType === 'student') items = items.filter((item) => pathway === 'none' ? !item.track_selected : item.track_selected === pathway);
  if (activity) {
    const isActive = (item) => personType === 'student' ? item.applications_count > 0 : (item.research_projects_posted > 0 || item.active_mentees > 0);
    items = items.filter((item) => activity === 'active' ? isActive(item) : !isActive(item));
  }
  const total = items.length;
  const start = (pageNum - 1) * pageSize;
  res.json({ cycle, person_type: personType, items: items.slice(start, start + pageSize), total, page: pageNum, page_size: pageSize });
});

router.get('/oversight/activity/:personType/:id', requireAuth, requireRole(...ACTIVITY_ROLES), requireCrcsPermission('view_analytics'), async (req, res) => {
  const personType = req.params.personType;
  if (!['faculty', 'student'].includes(personType)) return res.status(400).json({ error: 'invalid person type' });
  const parsed = z.object({ cycle_id: z.string().uuid() }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'cycle_id must be a UUID' });
  const cycle = await requireVisibleCycle(req, res, parsed.data.cycle_id, { mode: 'read' });
  if (!cycle) return;
  if (!(await canViewActivityDetail(req, personType, req.params.id, cycle.id))) return res.status(403).json({ error: 'this person is outside your activity-monitor scope' });

  const person = unwrap(await supabase.from('users').select('id,full_name,email,last_login_at').eq('id', req.params.id).maybeSingle());
  if (!person) return res.status(404).json({ error: 'person not found' });
  const lastAction = unwrap(await supabase.from('audit_log').select('action,created_at').eq('actor_id', person.id).order('created_at', { ascending: false }).limit(1).maybeSingle());
  const lastRecordedAction = lastAction ? { action: lastAction.action, at: lastAction.created_at } : null;

  if (personType === 'student') {
    const [profile, trackSelection, applications] = await Promise.all([
      supabase.from('students').select('roll_number,department_id').eq('id', person.id).maybeSingle().then(unwrap),
      supabase.from('student_track_selections').select('track').eq('student_id', person.id).eq('cycle_id', cycle.id).order('created_at', { ascending: false }).limit(1).maybeSingle().then(unwrap),
      studentApplicationsDetail(person.id),
    ]);
    const department = profile?.department_id ? (await supabase.from('departments').select('name').eq('id', profile.department_id).maybeSingle().then(unwrap))?.name ?? null : null;
    return res.json({ student: { ...person, roll_number: profile?.roll_number ?? null, department }, track_selected: trackSelection?.track ?? null, applications, last_recorded_action: lastRecordedAction });
  }

  const [profile, detail] = await Promise.all([
    supabase.from('faculty').select('department_id,mentorship_scope,cabin').eq('id', person.id).maybeSingle().then(unwrap),
    facultyActivityDetail(person.id, cycle.id),
  ]);
  const department = profile?.department_id ? (await supabase.from('departments').select('name').eq('id', profile.department_id).maybeSingle().then(unwrap))?.name ?? null : null;
  res.json({ faculty: { ...person, department, mentorship_scope: profile?.mentorship_scope ?? null }, research_projects: detail.projects, mentees: detail.mentees, last_recorded_action: lastRecordedAction });
});

export default router;
