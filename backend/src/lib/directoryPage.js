import { z } from 'zod';
import { supabase, unwrap } from '../db/client.js';
import { scopeToDepartment } from '../middleware/auth.js';

export const directoryPageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).default(''),
  role: z.enum(['student', 'faculty', 'faculty_coordinator', 'hod', 'dean', 'school_office', 'crcs_coordinator', 'crcs_superadmin']).optional(),
  department_id: z.string().uuid().optional(), school_id: z.string().uuid().optional(),
  student_id: z.string().uuid().optional(),
  track: z.enum(['research', 'crcs_opportunity', 'self_internship']).optional(),
});

// Offset reads are deliberately ordered and bounded: the REST server's default
// row limit must never silently decide which people exist in a directory.
export async function readAllRows(makeQuery) {
  const result = [];
  for (let start = 0; ; start += 500) {
    const rows = unwrap(await makeQuery().range(start, start + 499));
    result.push(...rows);
    if (rows.length < 500) return result;
  }
}

export async function directoryPage(req, cycleId, params) {
  const scope = scopeToDepartment(req);
  const system = scope.isSystemWide || req.user.roles.some((r) => r.role === 'crcs_coordinator');
  let departmentIds = system ? null : [...(scope.departmentIds ?? [])];
  if (!system && scope.schoolIds?.length) departmentIds = unwrap(await supabase.from('departments').select('id').in('school_id', scope.schoolIds)).map((d) => d.id);
  if (params.school_id) {
    const schoolDepartments = unwrap(await supabase.from('departments').select('id').eq('school_id', params.school_id)).map((d) => d.id);
    departmentIds = departmentIds === null ? schoolDepartments : departmentIds.filter((id) => schoolDepartments.includes(id));
  }
  if (params.department_id) departmentIds = departmentIds === null ? [params.department_id] : departmentIds.filter((id) => id === params.department_id);
  const empty = { items: [], total: 0, page: params.page, page_size: params.page_size };
  if (departmentIds && !departmentIds.length) return empty;
  const profileJoin = params.track ? '!inner' : '';
  let query = supabase.from('users').select(`id,email,full_name,phone,is_active,created_at,
    roles:user_roles!inner(role,department_id,school_id),
    profile:students${profileJoin}(roll_number,department_id,selections:student_track_selections${profileJoin}(track,cycle_id)),
    roll_match:students(roll_number),
    memberships:cycle_participants!cycle_participants_user_id_fkey!inner(cycle_id,participant_type)`, { count: 'exact' })
    .eq('memberships.cycle_id', cycleId).order('full_name').order('id');
  if (params.role) query = query.eq('roles.role', params.role).eq('memberships.participant_type', params.role);
  if (departmentIds) query = query.in('roles.department_id', departmentIds);
  if (params.student_id) query = query.eq('id', params.student_id);
  if (params.track) query = query.eq('profile.selections.cycle_id', cycleId).eq('profile.selections.track', params.track);
  if (params.search) {
    // Strip PostgREST grammar characters, retaining ordinary name/email/roll text.
    const term = params.search.replace(/[(),.*%_\\]/g, ' ').trim();
    if (term) query = query.ilike('roll_match.roll_number', `%${term}%`).or(`full_name.ilike.%${term}%,email.ilike.%${term}%,roll_match.not.is.null`);
  }
  const { data, count, error } = await query.range((params.page - 1) * params.page_size, params.page * params.page_size - 1);
  const rows = unwrap({ data, error });
  const ids = rows.map((row) => row.id);
  const faculty = ids.length ? unwrap(await supabase.from('faculty').select('id,mentorship_scope,cabin').in('id', ids)) : [];
  const byId = new Map(faculty.map((row) => [row.id, row]));
  return { ...empty, total: count ?? 0, items: rows.map(({ memberships, profile, roll_match, ...user }) => ({ ...user,
    roles: user.roles.filter((role) => memberships.some((membership) => membership.participant_type === role.role)),
    participant_type: memberships[0]?.participant_type, roll_number: profile?.roll_number ?? null,
    mentorship_scope: byId.get(user.id)?.mentorship_scope ?? null, cabin: byId.get(user.id)?.cabin ?? null,
  })) };
}
