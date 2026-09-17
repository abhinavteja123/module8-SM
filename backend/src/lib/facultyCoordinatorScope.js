import { supabase, unwrap } from '../db/client.js';

// A Faculty Coordinator's monitoring scope is deliberately narrower than HOD's: only the
// specific faculty CRCS mapped to them (faculty_coordinator_assignments, capped at 10 by
// design), plus those faculty's current mentees — not the whole department. A person can
// also hold hod/dean/etc alongside faculty_coordinator; req.query.act_as=faculty_coordinator
// lets the frontend explicitly ask for this narrow view even though a broader role would
// otherwise win by default (e.g. the dedicated "Faculty Coordinator workspace").
export function isScopedFacultyCoordinator(req) {
  const roles = req.user.roles.map((role) => role.role);
  if (!roles.includes('faculty_coordinator')) return false;
  if (req.query.act_as === 'faculty_coordinator') return true;
  return !roles.some((role) => ['hod', 'dean', 'school_office', 'crcs_coordinator', 'crcs_superadmin'].includes(role));
}

export async function facultyCoordinatorFacultyIds(coordinatorId) {
  const rows = unwrap(await supabase.from('faculty_coordinator_assignments').select('faculty_id').eq('coordinator_id', coordinatorId));
  return [...new Set(rows.map((row) => row.faculty_id))];
}

export async function facultyCoordinatorStudentIds(facultyIds, cycleId) {
  if (!facultyIds.length) return [];
  const [research, opportunity, self] = await Promise.all([
    supabase.from('mentor_assignments').select('student_id').in('faculty_id', facultyIds).eq('is_current', true).then(unwrap),
    supabase.from('opportunity_applications').select('student_id').in('assigned_mentor_id', facultyIds).eq('status', 'crcs_approved').then(unwrap),
    supabase.from('self_internships').select('student_id').in('assigned_mentor_id', facultyIds).eq('status', 'active').eq('cycle_id', cycleId).then(unwrap),
  ]);
  return [...new Set([...research.map((row) => row.student_id), ...opportunity.map((row) => row.student_id), ...self.map((row) => row.student_id)])];
}
