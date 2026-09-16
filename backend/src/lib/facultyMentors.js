import { supabase, unwrap } from '../db/client.js';
import { getPortalSettings } from './portalSettings.js';

// Faculty available for CRCS-opportunity and self-internship mentorship
// share one capacity pool (mentorship_scope = 'crcs_self'), so both routes
// call this instead of keeping their own copy of the eligibility/load query.
export async function facultyMentors(universityId) {
  const { max_mentees_per_faculty } = await getPortalSettings(universityId);
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
    .filter((user) => (load[user.id] ?? 0) < max_mentees_per_faculty)
    .map((user) => ({ ...user, cabin: cabinById[user.id] ?? null, active_allocations: load[user.id] ?? 0, allocation_limit: max_mentees_per_faculty }));
}
