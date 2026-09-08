import { supabase, unwrap } from '../db/client.js';

const APPROVED_SELF_INTERNSHIP_STATUSES = ['active', 'completed'];

/**
 * Returns the internship that has already been accepted by CRCS, if any.
 * An approved internship is exclusive across all three student paths.
 */
export async function findApprovedInternship(studentId) {
  const [opportunity, research, selfInternship] = await Promise.all([
    supabase.from('opportunity_applications').select('id').eq('student_id', studentId).eq('status', 'crcs_approved').limit(1).maybeSingle(),
    supabase.from('research_applications').select('id').eq('student_id', studentId).eq('status', 'crcs_approved').limit(1).maybeSingle(),
    supabase.from('self_internships').select('id').eq('student_id', studentId).in('status', APPROVED_SELF_INTERNSHIP_STATUSES).limit(1).maybeSingle(),
  ]);
  if (unwrap(opportunity)) return { track: 'CRCS opportunity' };
  if (unwrap(research)) return { track: 'research internship' };
  if (unwrap(selfInternship)) return { track: 'self-internship' };
  return null;
}

/**
 * Closes applications that can no longer be selected once CRCS approves an
 * internship. Self-internships have no `revoked` status, so they are recorded
 * as a system rejection with an audit-friendly reason instead.
 */
export async function closeCompetingApplications(studentId, approvedTrack, now) {
  const reason = `Auto-revoked: CRCS approved a ${approvedTrack}.`;
  await Promise.all([
    supabase.from('research_applications').update({ status: 'revoked', rejection_reason: reason, updated_at: now })
      .eq('student_id', studentId).in('status', ['pending_faculty', 'pending_crcs_approval']),
    supabase.from('opportunity_applications').update({ status: 'revoked', rejection_reason: reason, updated_at: now })
      .eq('student_id', studentId).in('status', ['applied', 'under_review', 'offered']),
    supabase.from('self_internships').update({ status: 'rejected', rejection_reason: reason, rejected_by_role: 'crcs_superadmin', updated_at: now })
      .eq('student_id', studentId).in('status', ['submitted', 'mentor_approved', 'crcs_approved']),
  ]).then((results) => results.forEach(unwrap));
}
