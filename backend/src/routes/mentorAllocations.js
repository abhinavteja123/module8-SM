import { Router } from 'express';
import { z } from 'zod';
import { supabase, unwrap } from '../db/client.js';
import { requireAuth, requireRole, scopeToDepartment } from '../middleware/auth.js';
import { requireVisibleCycle } from '../lib/cycleVisibility.js';

const router = Router();

router.get('/mentor-allocations', requireAuth, requireRole('crcs_superadmin', 'crcs_coordinator', 'hod', 'faculty_coordinator', 'faculty', 'school_office'), async (req, res) => {
  const query = z.object({ cycle_id: z.string().uuid().optional(), page: z.coerce.number().int().min(1).optional(), page_size: z.coerce.number().int().min(1).max(100).optional(), search: z.string().trim().max(100).optional() }).safeParse(req.query);
  if (!query.success) return res.status(400).json({ error: query.error.flatten() });
  if (query.data.cycle_id && !(await requireVisibleCycle(req, res, query.data.cycle_id))) return;
  const roles = req.user.roles.map((role) => role.role);
  const isCrcs = roles.some((role) => ['crcs_superadmin', 'crcs_coordinator'].includes(role));
  const isFacultyOnly = roles.includes('faculty') && !roles.some((role) => ['crcs_superadmin', 'crcs_coordinator', 'hod', 'faculty_coordinator'].includes(role));
  if (query.data.page || query.data.page_size) {
    if (!query.data.cycle_id) return res.status(400).json({ error: 'cycle_id is required when paging mentor allocations' });
    const scope = isCrcs ? { departmentIds: null, schoolIds: null } : scopeToDepartment(req);
    const result = unwrap(await supabase.rpc('mentor_allocation_page', {
      p_cycle_id: query.data.cycle_id,
      p_department_ids: isFacultyOnly ? null : (scope.departmentIds ?? null),
      p_school_ids: isFacultyOnly ? null : (scope.schoolIds ?? null),
      p_faculty_id: isFacultyOnly ? req.user.id : null,
      p_search: query.data.search ?? null,
      p_page: query.data.page ?? 1,
      p_page_size: query.data.page_size ?? 50,
    }));
    const page = Array.isArray(result) ? result[0] : result;
    return res.json({ items: page?.items ?? [], total: Number(page?.total ?? 0), page: query.data.page ?? 1, page_size: query.data.page_size ?? 50 });
  }
  const [opportunities, selfInternships, researchAssignments] = await Promise.all([
    supabase.from('opportunity_applications').select('*').eq('status', 'crcs_approved'),
    supabase.from('self_internships').select('*').eq('status', 'active'),
    supabase.from('mentor_assignments').select('*').eq('is_current', true),
  ]);
  const opportunityRows = unwrap(opportunities);
  const selfRows = unwrap(selfInternships);
  const researchRows = unwrap(researchAssignments);
  const studentIds = [...new Set([...opportunityRows, ...selfRows, ...researchRows].map((row) => row.student_id))];
  const mentorIds = [...new Set([
    ...opportunityRows.map((row) => row.assigned_mentor_id),
    ...selfRows.map((row) => row.assigned_mentor_id),
    ...researchRows.map((row) => row.faculty_id),
  ].filter(Boolean))];
  const opportunityIds = [...new Set(opportunityRows.map((row) => row.opportunity_id))];
  const projectIds = [...new Set(researchRows.map((row) => row.research_application_id))];
  const applications = projectIds.length ? unwrap(await supabase.from('research_applications').select('id,project_id').in('id', projectIds)) : [];
  const researchProjectIds = [...new Set(applications.map((row) => row.project_id))];
  const [students, opportunityDetails, projects, mentorProfiles, leadershipRoles] = await Promise.all([
    studentIds.length ? supabase.from('students').select('id,department_id,roll_number,batch_year,cgpa').in('id', studentIds) : { data: [] },
    opportunityIds.length ? supabase.from('crcs_opportunities').select('id,title,organization_name,cycle_id').in('id', opportunityIds) : { data: [] },
    researchProjectIds.length ? supabase.from('research_projects').select('id,title,cycle_id').in('id', researchProjectIds) : { data: [] },
    mentorIds.length ? supabase.from('faculty').select('id,department_id,cabin').in('id', mentorIds) : { data: [] },
    supabase.from('user_roles').select('user_id,role,department_id,school_id').in('role', ['hod', 'dean']),
  ]);
  const studentRows = unwrap(students);
  const mentorProfileRows = unwrap(mentorProfiles);
  const leadershipRows = unwrap(leadershipRoles);
  const departmentIds = [...new Set([...studentRows, ...mentorProfileRows].map((row) => row.department_id).filter(Boolean))];
  const departments = departmentIds.length ? unwrap(await supabase.from('departments').select('id,school_id,name,code').in('id', departmentIds)) : [];
  const schoolIds = [...new Set(departments.map((row) => row.school_id).filter(Boolean))];
  const schools = schoolIds.length ? unwrap(await supabase.from('schools').select('id,name,code').in('id', schoolIds)) : [];
  const opportunityById = Object.fromEntries(unwrap(opportunityDetails).map((row) => [row.id, row]));
  const applicationById = Object.fromEntries(applications.map((row) => [row.id, row]));
  const projectById = Object.fromEntries(unwrap(projects).map((row) => [row.id, row]));
  const studentById = Object.fromEntries(studentRows.map((row) => [row.id, row]));
  const departmentById = Object.fromEntries(departments.map((row) => [row.id, row]));
  const schoolById = Object.fromEntries(schools.map((row) => [row.id, row]));
  const mentorProfileById = Object.fromEntries(mentorProfileRows.map((row) => [row.id, row]));
  const mentorDepartmentById = Object.fromEntries(mentorProfileRows.map((row) => [row.id, row.department_id]));
  const hodByDepartmentId = Object.fromEntries(leadershipRows.filter((row) => row.role === 'hod' && row.department_id).map((row) => [row.department_id, row.user_id]));
  const deanBySchoolId = Object.fromEntries(leadershipRows.filter((row) => row.role === 'dean' && row.school_id).map((row) => [row.school_id, row.user_id]));
  const peopleIds = [...new Set([
    ...studentIds,
    ...mentorIds,
    ...leadershipRows.map((row) => row.user_id),
    ...opportunityRows.map((row) => row.mentor_assigned_by),
    ...selfRows.map((row) => row.mentor_assigned_by),
    ...researchRows.map((row) => row.reassigned_by),
  ].filter(Boolean))];
  const people = peopleIds.length ? unwrap(await supabase.from('users').select('id,full_name,email,phone').in('id', peopleIds)) : [];
  const personById = Object.fromEntries(people.map((person) => [person.id, person]));
  const studentDetails = (studentId) => {
    const profile = studentById[studentId];
    const department = departmentById[profile?.department_id];
    return personById[studentId] ? { ...personById[studentId], ...profile, department: department ? { ...department, school: schoolById[department.school_id] ?? null } : null } : null;
  };
  const mentorHierarchy = (mentorId) => {
    const department = departmentById[mentorDepartmentById[mentorId]];
    const school = department ? schoolById[department.school_id] : null;
    if (!department) return null;
    return {
      department: { id: department.id, name: department.name, code: department.code },
      school: school ? { id: school.id, name: school.name, code: school.code } : null,
      hod: personById[hodByDepartmentId[department.id]] ?? null,
      dean: school ? personById[deanBySchoolId[school.id]] ?? null : null,
    };
  };
  const mentorDetails = (mentorId) => personById[mentorId] ? { ...personById[mentorId], cabin: mentorProfileById[mentorId]?.cabin ?? null } : null;
  const mappings = [
    ...opportunityRows.map((row) => ({ id: row.id, type: 'opportunity', cycle_id: opportunityById[row.opportunity_id]?.cycle_id ?? null, student_id: row.student_id, student: studentDetails(row.student_id), mentor_id: row.assigned_mentor_id ?? null, mentor: mentorDetails(row.assigned_mentor_id), mentor_hierarchy: mentorHierarchy(row.assigned_mentor_id), title: opportunityById[row.opportunity_id]?.title ?? 'CRCS opportunity', subtitle: opportunityById[row.opportunity_id]?.organization_name ?? null, last_updated_at: row.mentor_assigned_at ?? null, last_updated_by: personById[row.mentor_assigned_by] ?? null })),
    ...selfRows.map((row) => ({ id: row.id, type: 'self_internship', cycle_id: row.cycle_id, student_id: row.student_id, student: studentDetails(row.student_id), mentor_id: row.assigned_mentor_id ?? null, mentor: mentorDetails(row.assigned_mentor_id), mentor_hierarchy: mentorHierarchy(row.assigned_mentor_id), title: row.company_name, subtitle: 'Self-internship', last_updated_at: row.mentor_assigned_at ?? null, last_updated_by: personById[row.mentor_assigned_by] ?? null })),
    ...researchRows.map((row) => ({ id: row.id, type: 'research', cycle_id: projectById[applicationById[row.research_application_id]?.project_id]?.cycle_id ?? null, student_id: row.student_id, student: studentDetails(row.student_id), mentor_id: row.faculty_id, mentor: mentorDetails(row.faculty_id), mentor_hierarchy: mentorHierarchy(row.faculty_id), title: projectById[applicationById[row.research_application_id]?.project_id]?.title ?? 'Research internship', subtitle: 'Research internship', last_updated_at: row.started_at ?? null, last_updated_by: personById[row.reassigned_by] ?? null })),
  ];
  let visible = mappings;
  if (isFacultyOnly) visible = mappings.filter((mapping) => mapping.mentor_id === req.user.id);
  else if (!isCrcs) {
    const scope = scopeToDepartment(req);
    visible = mappings.filter((mapping) => {
      const departmentId = studentById[mapping.student_id]?.department_id;
      return scope.isSystemWide || scope.departmentIds?.includes(departmentId) || scope.schoolIds?.includes(departmentById[departmentId]?.school_id);
    });
  }
  if (query.data.cycle_id) visible = visible.filter((mapping) => mapping.cycle_id === query.data.cycle_id);
  if (query.data.search) {
    const term = query.data.search.toLowerCase();
    visible = visible.filter((mapping) => [mapping.student?.full_name, mapping.student?.roll_number, mapping.mentor?.full_name, mapping.title].some((value) => value?.toLowerCase().includes(term)));
  }
  visible.sort((a, b) => a.student?.full_name?.localeCompare(b.student?.full_name ?? '') ?? 0);
  res.json({ mappings: visible });
});

export default router;
