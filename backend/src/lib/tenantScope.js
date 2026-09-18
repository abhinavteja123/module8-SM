import { supabase, unwrap } from '../db/client.js';

// Every non-platform-admin row in `users` carries university_id (migration
// 20260912000042). Students/faculty/coordinators are all users, so comparing
// this one column is the single cheap check that closes a tenant boundary
// regardless of whether the target is a student, faculty member, or oversight
// role — no need to walk department/school joins per caller.
export async function isSameUniversity(req, targetUserId) {
  if (!targetUserId) return false;
  if (req.user.isPlatformAdmin) return true;
  const target = unwrap(await supabase.from('users').select('university_id').eq('id', targetUserId).maybeSingle());
  return Boolean(target) && target.university_id === req.user.university_id;
}
