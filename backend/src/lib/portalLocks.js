import { supabase, unwrap } from '../db/client.js';

export const LOCK_TYPE = Object.freeze({
  STUDENT_PORTAL: 'student_portal',
  FACULTY_PROJECTS: 'faculty_projects',
  FACULTY_ASSIGNMENTS: 'faculty_assignments',
  FACULTY_MARKS: 'faculty_marks',
});

export function crcsActorRole(user) {
  return user.roles.some((role) => role.role === 'crcs_superadmin')
    ? 'crcs_superadmin'
    : user.roles.some((role) => role.role === 'crcs_coordinator')
      ? 'crcs_coordinator'
      : user.roles.some((role) => role.role === 'faculty_coordinator')
        ? 'faculty_coordinator'
        : 'hod';
}

export async function activePortalLock(lockType, subjectId) {
  return unwrap(await supabase.from('portal_locks')
    .select('id,lock_type,subject_id,is_locked,reason,locked_at')
    .eq('lock_type', lockType).eq('subject_id', subjectId).eq('is_locked', true).maybeSingle());
}

export async function requireUnlocked(lockType, subjectId, res) {
  const lock = await activePortalLock(lockType, subjectId);
  if (!lock) return true;
  res.status(423).json({
    error: lockType === LOCK_TYPE.STUDENT_PORTAL
      ? 'your student portal is locked; submit an unlock request to CRCS or your coordinator'
      : `your faculty ${lockType.replace('faculty_', '').replaceAll('_', ' ')} workspace is locked; submit an unlock request to CRCS or your coordinator`,
    lock: { type: lock.lock_type, locked_at: lock.locked_at, reason: lock.reason ?? null },
  });
  return false;
}

export async function requireStudentPortalUnlocked(req, res) {
  return requireUnlocked(LOCK_TYPE.STUDENT_PORTAL, req.user.id, res);
}

export async function requireFacultyProjectsUnlocked(facultyId, res) {
  return requireUnlocked(LOCK_TYPE.FACULTY_PROJECTS, facultyId, res);
}

export async function requireFacultyAssignmentsUnlocked(facultyId, res) {
  return requireFacultyDeadlineControlledWorkspaceUnlocked(LOCK_TYPE.FACULTY_ASSIGNMENTS, facultyId, res);
}

export async function requireFacultyMarksUnlocked(facultyId, res) {
  return requireFacultyDeadlineControlledWorkspaceUnlocked(LOCK_TYPE.FACULTY_MARKS, facultyId, res);
}

// A report deadline is the final normal editing window for the supervising
// faculty member.  The first attempted post-deadline change materialises a
// regular lock record, so the same reviewable unlock-request workflow applies.
async function requireFacultyDeadlineControlledWorkspaceUnlocked(lockType, facultyId, res) {
  const existing = await activePortalLock(lockType, facultyId);
  if (existing) return requireUnlocked(lockType, facultyId, res);
  const expired = unwrap(await supabase.from('report_deadlines').select('id,title,due_at')
    .eq('assigned_by', facultyId).lt('due_at', new Date().toISOString()).order('due_at', { ascending: false }).limit(1).maybeSingle());
  if (!expired) return true;
  const now = new Date().toISOString();
  const [lock] = unwrap(await supabase.from('portal_locks').upsert({
    lock_type: lockType,
    subject_id: facultyId,
    is_locked: true,
    reason: `Automatically locked after the report deadline “${expired.title}” passed.`,
    locked_at: now,
    updated_at: now,
  }, { onConflict: 'lock_type,subject_id' }).select());
  unwrap(await supabase.from('audit_log').insert({
    action: 'automatic_lock_after_report_deadline',
    entity_type: 'portal_locks',
    entity_id: lock.id,
    new_value: { lock_type: lockType, subject_id: facultyId, deadline_id: expired.id, deadline_due_at: expired.due_at },
  }));
  return requireUnlocked(lockType, facultyId, res);
}
