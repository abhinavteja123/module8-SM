import { supabase, unwrap } from '../db/client.js';
import { scopeToDepartment } from '../middleware/auth.js';
import { readAllRows } from './directoryPage.js';

// Faculty coordinators intentionally retain their open-cycle workspace only.
const HISTORY_ROLES = ['crcs_superadmin', 'crcs_coordinator', 'hod', 'dean', 'school_office'];
const SETUP_ROLES = ['crcs_superadmin'];

export function canViewCycleHistory(user) {
  return (user?.roles ?? []).some((assignment) => HISTORY_ROLES.includes(assignment.role));
}

export function isExpiredCycle(cycle) {
  return cycle?.status === 'closed';
}

export function isCycleSetupUser(user) {
  return Boolean((user?.roles ?? []).some((assignment) => SETUP_ROLES.includes(assignment.role)));
}

export function cycleScope(req) {
  return scopeToDepartment(req);
}

export function isInCycleScope(scope, participant) {
  return Boolean(scope.isSystemWide
    || scope.departmentIds?.includes(participant?.department_id)
    || scope.schoolIds?.includes(participant?.school_id));
}

export function cycleAccessDecision({ user, status, mode = 'read', hasMembership }) {
  if (!['read', 'write', 'setup'].includes(mode)) return { allowed: false, statusCode: 500 };
  if (status === 'not_started') return mode === 'setup' && isCycleSetupUser(user)
    ? { allowed: true } : { allowed: false, statusCode: 403 };
  if (status === 'closed') {
    if (mode !== 'read') return { allowed: false, statusCode: 409 };
    if (!canViewCycleHistory(user)) return { allowed: false, statusCode: 410 };
  } else if (mode === 'setup') return { allowed: false, statusCode: 409 };
  return hasMembership ? { allowed: true } : { allowed: false, statusCode: 403 };
}

// Shared lifecycle guard. `setup` is draft-only, `write` is open-only, and
// `read` allows open participants or historical oversight readers.
export async function requireVisibleCycle(req, res, cycleId, { mode = 'read' } = {}) {
  if (!cycleId) {
    const memberships = await readAllRows(() => supabase.from('cycle_participants').select('cycle_id').eq('user_id', req.user.id).order('cycle_id'));
    const cycleIds = [...new Set(memberships.map((membership) => membership.cycle_id))];
    if (!cycleIds.length) {
      res.status(400).json({ error: 'cycle_id is required because no open cycle is in your workspace' });
      return null;
    }
    const current = unwrap(await supabase.from('internship_cycles').select('id').eq('status', 'open').in('id', cycleIds).order('preference_window_opens_at', { ascending: false }).limit(1).maybeSingle());
    if (!current) {
      res.status(400).json({ error: 'cycle_id is required because no open cycle is in your workspace' });
      return null;
    }
    cycleId = current.id;
  }
  const cycle = unwrap(await supabase.from('internship_cycles').select('id,name,status,university_id').eq('id', cycleId).maybeSingle());
  if (!cycle || cycle.university_id !== req.user.university_id) {
    res.status(404).json({ error: 'internship cycle not found' });
    return null;
  }
  const membership = unwrap(await supabase.from('cycle_participants').select('id').eq('cycle_id', cycle.id).eq('user_id', req.user.id).maybeSingle());
  const decision = cycleAccessDecision({ user: req.user, status: cycle.status, mode, hasMembership: Boolean(membership) });
  if (!decision.allowed) {
    const messages = { 403: 'this cycle is outside your workspace', 409: 'this internship cycle is closed and read-only', 410: 'this internship cycle has ended and is no longer available in your workspace', 500: 'unsupported cycle access mode' };
    res.status(decision.statusCode).json({ error: messages[decision.statusCode] });
    return null;
  }
  return cycle;
}
