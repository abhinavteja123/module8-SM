import { Router } from 'express';
import { supabase, unwrap } from '../db/client.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

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
    const facultyIds = unwrap(facultyRoles).map((row) => row.user_id);
    const coordinatorIds = new Set(unwrap(coordinatorRoles).map((row) => row.user_id));
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
      totals: { faculty: faculty.length, students: unwrap(studentProfiles).length, coordinators: coordinators.length },
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
  const hodByDept = Object.fromEntries(unwrap(hodRoles).map((row) => [row.department_id, row.user_id]));
  const hodIds = Object.values(hodByDept);
  const people = hodIds.length ? unwrap(await supabase.from('users').select('id,full_name,email').in('id', hodIds)) : [];
  const personById = Object.fromEntries(people.map((person) => [person.id, person]));
  const facultyByDept = {};
  unwrap(facultyRoles).forEach((row) => { facultyByDept[row.department_id] = (facultyByDept[row.department_id] ?? 0) + 1; });
  const coordinatorByDept = {};
  unwrap(coordinatorRoles).forEach((row) => { coordinatorByDept[row.department_id] = (coordinatorByDept[row.department_id] ?? 0) + 1; });
  const studentByDept = {};
  unwrap(studentProfiles).forEach((row) => { studentByDept[row.department_id] = (studentByDept[row.department_id] ?? 0) + 1; });
  const departmentRows = departments.map((department) => ({
    department, hod: personById[hodByDept[department.id]] ?? null,
    faculty_count: facultyByDept[department.id] ?? 0, student_count: studentByDept[department.id] ?? 0, coordinator_count: coordinatorByDept[department.id] ?? 0,
  }));
  res.json({
    scope: 'school', school,
    totals: {
      departments: departments.length,
      faculty: departmentRows.reduce((sum, row) => sum + row.faculty_count, 0),
      students: departmentRows.reduce((sum, row) => sum + row.student_count, 0),
      coordinators: departmentRows.reduce((sum, row) => sum + row.coordinator_count, 0),
    },
    departments: departmentRows,
  });
});

export default router;
