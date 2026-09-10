import { supabase, unwrap } from '../db/client.js';

// A completed cycle remains an institutional record for oversight roles, but
// it must no longer appear as an active workspace for its participants.
const HISTORY_ROLES = ['crcs_superadmin', 'crcs_coordinator', 'hod', 'dean', 'school_office'];

export function canViewCycleHistory(user) {
  return (user?.roles ?? []).some((assignment) => HISTORY_ROLES.includes(assignment.role));
}

export function isExpiredCycle(cycle) {
  return cycle?.status === 'closed';
}

export async function requireVisibleCycle(req, res, cycleId) {
  const cycle = unwrap(await supabase.from('internship_cycles').select('id,name,status').eq('id', cycleId).maybeSingle());
  if (!cycle) {
    res.status(404).json({ error: 'internship cycle not found' });
    return null;
  }
  if (isExpiredCycle(cycle) && !canViewCycleHistory(req.user)) {
    res.status(410).json({ error: 'this internship cycle has ended and is no longer available in your workspace' });
    return null;
  }
  return cycle;
}
