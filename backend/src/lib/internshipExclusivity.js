import { supabase, unwrap } from '../db/client.js';

const SELECTED_SELF_INTERNSHIP_STATUSES = ['submitted', 'mentor_approved', 'crcs_approved', 'active', 'completed'];

/**
 * An uploaded self-internship offer letter confirms the student's selection;
 * it has the same exclusivity effect as a final research/CRCS approval.
 */
export async function findApprovedInternship(studentId, { excludeSelfInternshipId = null } = {}) {
  let selfQuery = supabase.from('self_internships').select('id').eq('student_id', studentId)
    .in('status', SELECTED_SELF_INTERNSHIP_STATUSES).not('offer_letter_doc_id', 'is', null).limit(1).maybeSingle();
  if (excludeSelfInternshipId) selfQuery = supabase.from('self_internships').select('id').eq('student_id', studentId)
    .neq('id', excludeSelfInternshipId).in('status', SELECTED_SELF_INTERNSHIP_STATUSES).not('offer_letter_doc_id', 'is', null).limit(1).maybeSingle();
  const [opportunity, research, selfInternship] = await Promise.all([
    supabase.from('opportunity_applications').select('id').eq('student_id', studentId).eq('status', 'crcs_approved').limit(1).maybeSingle(),
    supabase.from('research_applications').select('id').eq('student_id', studentId).eq('status', 'crcs_approved').limit(1).maybeSingle(),
    selfQuery,
  ]);
  if (unwrap(opportunity)) return { track: 'CRCS opportunity' };
  if (unwrap(research)) return { track: 'research internship' };
  if (unwrap(selfInternship)) return { track: 'self-internship offer' };
  return null;
}

/**
 * Closes every competing path once a final research/CRCS decision, or a
 * confirmed self-internship offer letter, selects one internship.
 */
export async function closeCompetingApplications(studentId, selectedTrack, now, { keepSelfInternshipId = null, reason: suppliedReason = null } = {}) {
  const reason = suppliedReason ?? `Auto-revoked: ${selectedTrack} was selected.`;
  let selfQuery = supabase.from('self_internships').update({ status: 'revoked', rejection_reason: reason, updated_at: now })
    .eq('student_id', studentId).in('status', ['submitted', 'mentor_approved', 'crcs_approved']);
  if (keepSelfInternshipId) selfQuery = selfQuery.neq('id', keepSelfInternshipId);
  await Promise.all([
    supabase.from('research_applications').update({ status: 'revoked', rejection_reason: reason, updated_at: now })
      .eq('student_id', studentId).in('status', ['pending_faculty', 'pending_crcs_approval']),
    supabase.from('opportunity_applications').update({ status: 'revoked', rejection_reason: reason, updated_at: now })
      .eq('student_id', studentId).in('status', ['applied', 'under_review', 'offered']),
    selfQuery,
  ]).then((results) => results.forEach(unwrap));
}
