import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { supabase, unwrap } from '../db/client.js';
import { requireAuth, requireRole, scopeToDepartment } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';
import { createPortalUser, replacePortalUserRoles } from '../lib/users.js';
import { getSignedUrl } from '../lib/storage.js';
import { crcsActorRole, LOCK_TYPE } from '../lib/portalLocks.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// ponytail: hand-rolled CSV split, no embedded-comma/quote support — fine for a plain
// email,password,full_name,... export. Swap for a real CSV lib (or `xlsx` for native
// .xlsx binaries) if onboarding sheets start containing commas in names/values.
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  if (!lines.length) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(',').map((c) => c.trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    return row;
  });
}

function parsePeopleUpload(file) {
  if (/\.xlsx$/i.test(file.originalname) || file.mimetype.includes('spreadsheetml')) {
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) return [];
    return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false }).map((row) => Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key.trim(), String(value).trim()])
    ));
  }
  return parseCsv(file.buffer.toString('utf8'));
}

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().min(1),
  phone: z.string().optional(),
  roll_number: z.string().trim().max(100).optional(),
  batch_year: z.coerce.number().int().min(2000).max(2100).optional(),
  mentorship_scope: z.enum(['research', 'crcs_self']).optional(),
  roles: z.array(z.object({
    role: z.enum(['student', 'faculty', 'faculty_coordinator', 'hod', 'crcs_coordinator', 'crcs_superadmin', 'dean', 'school_office']),
    department_id: z.string().uuid().optional(),
    school_id: z.string().uuid().optional(),
  })).min(1),
});

router.post('/users', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email, password, full_name, phone, roll_number, batch_year, roles, mentorship_scope } = parsed.data;
  const user = await createPortalUser({ email, password, full_name, phone, roll_number, batch_year, roles, mentorship_scope });

  await logAudit({
    actorId: req.user.id, actorRole: 'crcs_superadmin', action: 'create_user',
    entityType: 'users', entityId: user.id, newValue: { email, full_name, roles },
  });
  res.status(201).json({ id: user.id, email, full_name, roles });
});

router.get('/users', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const users = unwrap(await supabase.from('users').select('id,email,full_name,phone,is_active,created_at').order('full_name'));
  const roles = users.length ? unwrap(await supabase.from('user_roles').select('user_id,role,department_id,school_id').in('user_id', users.map((user) => user.id))) : [];
  const faculty = users.length ? unwrap(await supabase.from('faculty').select('id,mentorship_scope').in('id', users.map((user) => user.id))) : [];
  const rolesByUser = Object.groupBy(roles, (role) => role.user_id);
  const facultyById = Object.fromEntries(faculty.map((member) => [member.id, member]));
  res.json(users.map((user) => ({ ...user, mentorship_scope: facultyById[user.id]?.mentorship_scope ?? null, roles: rolesByUser[user.id] ?? [] })));
});

router.post('/users/bulk', requireAuth, requireRole('crcs_superadmin'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'missing file (field name "file")' });
  const rows = parsePeopleUpload(req.file);
  const results = [];
  const credentials = [];
  const generateCredentials = req.body.generate_credentials === 'true';
  const defaultDepartmentId = req.body.default_department_id || null;
  const defaultDepartment = defaultDepartmentId
    ? unwrap(await supabase.from('departments').select('id,code,school_id').eq('id', defaultDepartmentId).maybeSingle()) : null;
  if (defaultDepartmentId && !defaultDepartment) return res.status(400).json({ error: 'selected department not found' });

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // +1 for header, +1 for 1-index
    try {
      if (!row.email || !row.full_name || !row.role || (!row.password && !generateCredentials)) {
        throw new Error(generateCredentials ? 'missing required column (email/full_name/role)' : 'missing required column (email/password/full_name/role)');
      }
      let department_id = null;
      let school_id = null;
      if (defaultDepartment) {
        if (!['student', 'faculty'].includes(row.role)) throw new Error('cycle bulk upload supports student and faculty rows only');
        if (row.department_code && row.department_code !== defaultDepartment.code) throw new Error(`department_code must match selected department "${defaultDepartment.code}"`);
        department_id = defaultDepartment.id;
        school_id = defaultDepartment.school_id;
      } else if (row.department_code) {
        const d = unwrap(await supabase.from('departments').select('id').eq('code', row.department_code).maybeSingle());
        if (!d) throw new Error(`unknown department_code "${row.department_code}"`);
        department_id = d.id;
      }
      if (row.school_code) {
        const s = unwrap(await supabase.from('schools').select('id').eq('code', row.school_code).maybeSingle());
        if (!s) throw new Error(`unknown school_code "${row.school_code}"`);
        school_id = s.id;
      }

      const temporaryPassword = row.password || `${randomBytes(9).toString('base64url')}A1!`;
      const user = await createPortalUser({
        email: row.email, password: temporaryPassword, full_name: row.full_name, phone: row.phone || null,
        roles: [{ role: row.role, department_id, school_id }], mentorship_scope: row.mentorship_scope || 'research',
        roll_number: row.roll_number || null, batch_year: row.batch_year ? Number(row.batch_year) : null,
      });

      results.push({ row: rowNum, id: user.id, email: row.email, role: row.role, ok: true });
      if (generateCredentials) credentials.push({ row: rowNum, email: row.email, temporary_password: temporaryPassword });
    } catch (err) {
      results.push({ row: rowNum, email: row.email || '(missing)', ok: false, error: err.message });
    }
  }

  await logAudit({
    actorId: req.user.id, actorRole: 'crcs_superadmin', action: 'bulk_create_users',
    entityType: 'users', entityId: req.user.id,
    newValue: { total: rows.length, created: results.filter((r) => r.ok).length },
  });
  res.status(207).json({ results, credentials });
});

const rolesSchema = z.object({
  roles: z.array(z.object({
    role: z.enum(['student', 'faculty', 'faculty_coordinator', 'hod', 'crcs_coordinator', 'crcs_superadmin', 'dean', 'school_office']),
    department_id: z.string().uuid().optional(),
    school_id: z.string().uuid().optional(),
  })),
});

router.patch('/users/:id/roles', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const parsed = rolesSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { id } = req.params;
  const result = await replacePortalUserRoles(id, parsed.data.roles);
  res.json({ id, roles: result });
});

const editableRoleSchema = z.object({
  role: z.enum(['student', 'faculty', 'faculty_coordinator', 'hod', 'crcs_coordinator', 'crcs_superadmin', 'dean', 'school_office']),
  department_id: z.string().uuid().optional(),
  school_id: z.string().uuid().optional(),
});

const profileSchema = z.object({
  full_name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().nullable().optional(),
  password: z.string().min(8).optional(),
  mentorship_scope: z.enum(['research', 'crcs_self']).optional(),
  roles: z.array(editableRoleSchema).min(1).optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'provide at least one field to update' });

router.patch('/users/:id', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const target = unwrap(await supabase.from('users').select('id,email').eq('id', req.params.id).maybeSingle());
  if (!target) return res.status(404).json({ error: 'user not found' });
  const { password, roles, mentorship_scope, ...profile } = parsed.data;
  if (roles) {
    if (target.id === req.user.id && !roles.some((role) => role.role === 'crcs_superadmin')) return res.status(400).json({ error: 'you cannot remove your own Superadmin access' });
    for (const role of roles) {
      if (['student', 'faculty', 'faculty_coordinator', 'hod'].includes(role.role) && !role.department_id) return res.status(400).json({ error: `${role.role} requires a department` });
      if (['dean', 'school_office'].includes(role.role) && !role.school_id) return res.status(400).json({ error: `${role.role} requires a school` });
    }
    await replacePortalUserRoles(target.id, roles);
    const studentRole = roles.find((role) => role.role === 'student');
    const facultyRole = roles.find((role) => ['faculty', 'faculty_coordinator'].includes(role.role));
    if (studentRole) {
      const existingStudent = unwrap(await supabase.from('students').select('id').eq('id', target.id).maybeSingle());
      if (existingStudent) unwrap(await supabase.from('students').update({ department_id: studentRole.department_id }).eq('id', target.id));
      else unwrap(await supabase.from('students').insert({ id: target.id, department_id: studentRole.department_id, roll_number: `STU-${target.id.slice(0, 8).toUpperCase()}`, batch_year: new Date().getFullYear() }));
    }
    if (facultyRole) {
      const existingFaculty = unwrap(await supabase.from('faculty').select('id').eq('id', target.id).maybeSingle());
      const facultyChanges = { department_id: facultyRole.department_id, designation: facultyRole.role === 'faculty_coordinator' ? 'Faculty Coordinator' : 'Faculty Mentor', ...(mentorship_scope ? { mentorship_scope } : {}) };
      if (existingFaculty) unwrap(await supabase.from('faculty').update(facultyChanges).eq('id', target.id));
      else unwrap(await supabase.from('faculty').insert({ id: target.id, ...facultyChanges, mentorship_scope: mentorship_scope ?? 'research' }));
    }
  }
  const updatePayload = { ...profile, updated_at: new Date().toISOString() };
  if (password) updatePayload.password_hash = await bcrypt.hash(password, 10);
  const [updated] = unwrap(await supabase.from('users').update(updatePayload).eq('id', target.id).select('id,email,full_name,phone,is_active'));
  await logAudit({ actorId: req.user.id, actorRole: 'crcs_superadmin', action: 'edit_user_profile', entityType: 'users', entityId: target.id, oldValue: { email: target.email }, newValue: { ...profile, roles: roles ?? undefined, mentorship_scope: mentorship_scope ?? undefined, password_reset: Boolean(password) } });
  res.json(updated);
});

const facultyCoordinatorMappingSchema = z.object({
  coordinator_id: z.string().uuid(),
  faculty_ids: z.array(z.string().uuid()).min(1).max(10),
});

router.get('/faculty-coordinator-mapping', requireAuth, requireRole('crcs_superadmin'), async (_req, res) => {
  const [usersResult, rolesResult, departmentsResult, assignmentsResult] = await Promise.all([
    supabase.from('users').select('id,full_name,email,is_active').eq('is_active', true).order('full_name'),
    supabase.from('user_roles').select('user_id,role,department_id').in('role', ['faculty', 'faculty_coordinator']),
    supabase.from('departments').select('id,name,code,school_id').order('name'),
    supabase.from('faculty_coordinator_assignments').select('id,coordinator_id,faculty_id,department_id').order('created_at'),
  ]);
  const users = unwrap(usersResult);
  const roles = unwrap(rolesResult);
  const departments = unwrap(departmentsResult);
  const assignments = unwrap(assignmentsResult);
  const userById = Object.fromEntries(users.map((user) => [user.id, user]));
  const departmentById = Object.fromEntries(departments.map((department) => [department.id, department]));
  const coordinatorRoles = roles.filter((role) => role.role === 'faculty_coordinator' && userById[role.user_id]);
  const coordinatorIds = new Set(coordinatorRoles.map((role) => role.user_id));
  const facultyRoles = roles.filter((role) => role.role === 'faculty' && userById[role.user_id] && !coordinatorIds.has(role.user_id));
  const assignmentByFaculty = Object.fromEntries(assignments.map((assignment) => [assignment.faculty_id, assignment]));
  const facultyItem = (role) => ({ ...userById[role.user_id], department_id: role.department_id, department: departmentById[role.department_id] ?? null });
  res.json({
    coordinators: coordinatorRoles.map((role) => ({
      ...facultyItem(role),
      assigned_faculty: assignments.filter((assignment) => assignment.coordinator_id === role.user_id).map((assignment) => ({ ...facultyItem(facultyRoles.find((faculty) => faculty.user_id === assignment.faculty_id) ?? { user_id: assignment.faculty_id, department_id: assignment.department_id }), assignment_id: assignment.id })),
    })),
    unassigned_faculty: facultyRoles.filter((role) => !assignmentByFaculty[role.user_id]).map(facultyItem),
  });
});

router.post('/faculty-coordinator-mapping', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const parsed = facultyCoordinatorMappingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { coordinator_id: coordinatorId, faculty_ids: facultyIds } = parsed.data;
  const coordinatorRole = unwrap(await supabase.from('user_roles').select('department_id').eq('user_id', coordinatorId).eq('role', 'faculty_coordinator').maybeSingle());
  if (!coordinatorRole?.department_id) return res.status(400).json({ error: 'Choose an active Faculty Coordinator with a department.' });
  const [existingResult, facultyRolesResult, alreadyAssignedResult] = await Promise.all([
    supabase.from('faculty_coordinator_assignments').select('id').eq('coordinator_id', coordinatorId),
    supabase.from('user_roles').select('user_id,department_id').eq('role', 'faculty').in('user_id', facultyIds),
    supabase.from('faculty_coordinator_assignments').select('faculty_id').in('faculty_id', facultyIds),
  ]);
  const existing = unwrap(existingResult);
  const facultyRoles = unwrap(facultyRolesResult);
  const alreadyAssigned = unwrap(alreadyAssignedResult);
  if (existing.length + facultyIds.length > 10) return res.status(400).json({ error: `This coordinator can supervise ${10 - existing.length} more faculty member(s).` });
  if (facultyRoles.length !== facultyIds.length || facultyRoles.some((role) => role.department_id !== coordinatorRole.department_id)) return res.status(400).json({ error: 'Faculty and Faculty Coordinator must belong to the same department.' });
  if (alreadyAssigned.length) return res.status(409).json({ error: 'One or more selected faculty members are already assigned to a Faculty Coordinator.' });
  const rows = facultyIds.map((facultyId) => ({ coordinator_id: coordinatorId, faculty_id: facultyId, department_id: coordinatorRole.department_id }));
  const created = unwrap(await supabase.from('faculty_coordinator_assignments').insert(rows).select());
  await logAudit({ actorId: req.user.id, actorRole: 'crcs_superadmin', action: 'map_faculty_to_coordinator', entityType: 'faculty_coordinator_assignments', entityId: coordinatorId, newValue: { faculty_ids: facultyIds, count: created.length } });
  res.status(201).json({ assignments: created });
});

router.delete('/faculty-coordinator-mapping/:facultyId', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const existing = unwrap(await supabase.from('faculty_coordinator_assignments').select('id,coordinator_id,faculty_id').eq('faculty_id', req.params.facultyId).maybeSingle());
  if (!existing) return res.status(404).json({ error: 'Faculty Coordinator assignment not found.' });
  unwrap(await supabase.from('faculty_coordinator_assignments').delete().eq('id', existing.id));
  await logAudit({ actorId: req.user.id, actorRole: 'crcs_superadmin', action: 'unmap_faculty_from_coordinator', entityType: 'faculty_coordinator_assignments', entityId: existing.id, oldValue: { coordinator_id: existing.coordinator_id, faculty_id: existing.faculty_id } });
  res.json({ removed: existing.id });
});

router.get('/users/:id/dependencies', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const target = unwrap(await supabase.from('users').select('id,email,full_name,is_active').eq('id', req.params.id).maybeSingle());
  if (!target) return res.status(404).json({ error: 'user not found' });
  const [roles, mentorAssignments, coordinatorAssignments] = await Promise.all([
    supabase.from('user_roles').select('role,department_id').eq('user_id', target.id),
    supabase.from('mentor_assignments').select('id,student_id,research_application_id').eq('faculty_id', target.id).eq('is_current', true),
    supabase.from('faculty_coordinator_assignments').select('id,faculty_id,department_id').eq('coordinator_id', target.id),
  ]);
  const roleRows = unwrap(roles);
  const mentorRows = unwrap(mentorAssignments);
  const coordinatorRows = unwrap(coordinatorAssignments);
  const needsMentorReplacement = mentorRows.length > 0;
  const needsCoordinatorReplacement = coordinatorRows.length > 0;
  const departmentIds = [...new Set([...roleRows.map((role) => role.department_id), ...coordinatorRows.map((assignment) => assignment.department_id)].filter(Boolean))];
  const candidateRoles = unwrap(await supabase.from('user_roles').select('user_id,role,department_id').in('role', ['faculty', 'faculty_coordinator']).in('department_id', departmentIds.length ? departmentIds : ['00000000-0000-0000-0000-000000000000']));
  const candidateIds = [...new Set(candidateRoles.map((role) => role.user_id).filter((id) => id !== target.id))];
  const candidates = candidateIds.length ? unwrap(await supabase.from('users').select('id,full_name,email').in('id', candidateIds).eq('is_active', true)) : [];
  res.json({ target, active_mentees: mentorRows.length, managed_faculty: coordinatorRows.length, requires_replacement: needsMentorReplacement || needsCoordinatorReplacement, replacement_candidates: candidates });
});

const removeSchema = z.object({ replacement_user_id: z.string().uuid().optional() });

router.post('/users/:id/remove', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const parsed = removeSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const target = unwrap(await supabase.from('users').select('id,email,full_name,is_active').eq('id', req.params.id).maybeSingle());
  if (!target) return res.status(404).json({ error: 'user not found' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'you cannot remove your own Superadmin access' });
  const targetRoles = unwrap(await supabase.from('user_roles').select('role,department_id').eq('user_id', target.id));
  if (targetRoles.some((role) => role.role === 'crcs_superadmin')) {
    const admins = unwrap(await supabase.from('user_roles').select('user_id').eq('role', 'crcs_superadmin'));
    if (admins.length <= 1) return res.status(409).json({ error: 'create another CRCS Superadmin before removing the last one' });
  }
  const mentorAssignments = unwrap(await supabase.from('mentor_assignments').select('*').eq('faculty_id', target.id).eq('is_current', true));
  const coordinatorAssignments = unwrap(await supabase.from('faculty_coordinator_assignments').select('*').eq('coordinator_id', target.id));
  if ((mentorAssignments.length || coordinatorAssignments.length) && !parsed.data.replacement_user_id) {
    return res.status(409).json({ error: 'select a replacement before removing this person', active_mentees: mentorAssignments.length, managed_faculty: coordinatorAssignments.length });
  }
  const replacementId = parsed.data.replacement_user_id;
  if (replacementId) {
    if (replacementId === target.id) return res.status(400).json({ error: 'replacement must be a different person' });
    const replacement = unwrap(await supabase.from('users').select('id,is_active').eq('id', replacementId).maybeSingle());
    if (!replacement?.is_active) return res.status(400).json({ error: 'replacement account must be active' });
    const replacementRoles = unwrap(await supabase.from('user_roles').select('role,department_id').eq('user_id', replacementId));
    if (mentorAssignments.length && !replacementRoles.some((role) => ['faculty', 'faculty_coordinator'].includes(role.role))) return res.status(400).json({ error: 'replacement must be a Faculty Mentor or Faculty Coordinator' });
    if (coordinatorAssignments.length && !replacementRoles.some((role) => role.role === 'faculty_coordinator')) return res.status(400).json({ error: 'replacement must be a Faculty Coordinator' });
    const now = new Date().toISOString();
    for (const assignment of mentorAssignments) {
      unwrap(await supabase.from('mentor_assignments').update({ is_current: false, ended_at: now }).eq('id', assignment.id));
      unwrap(await supabase.from('mentor_assignments').insert({ student_id: assignment.student_id, research_application_id: assignment.research_application_id, faculty_id: replacementId, is_current: true, reassigned_from: assignment.id, reassigned_by: req.user.id, reassignment_reason: 'Mentor removed from the portal.' }));
    }
    for (const assignment of coordinatorAssignments) {
      const duplicate = unwrap(await supabase.from('faculty_coordinator_assignments').select('id').eq('coordinator_id', replacementId).eq('faculty_id', assignment.faculty_id).maybeSingle());
      if (duplicate) unwrap(await supabase.from('faculty_coordinator_assignments').delete().eq('id', assignment.id));
      else unwrap(await supabase.from('faculty_coordinator_assignments').update({ coordinator_id: replacementId }).eq('id', assignment.id));
    }
  }
  unwrap(await supabase.from('users').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', target.id));
  await logAudit({ actorId: req.user.id, actorRole: 'crcs_superadmin', action: 'remove_user_access', entityType: 'users', entityId: target.id, newValue: { replacement_user_id: replacementId ?? null, reassigned_mentees: mentorAssignments.length, reassigned_faculty: coordinatorAssignments.length } });
  res.json({ message: `${target.full_name} has been removed from portal access.`, reassigned_mentees: mentorAssignments.length, reassigned_faculty: coordinatorAssignments.length });
});

router.get('/preferences', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const cycle = unwrap(await supabase.from('internship_cycles').select('id,name,status,preference_changes_locked').eq('status', 'open').order('preference_window_opens_at', { ascending: false }).limit(1).maybeSingle());
  if (!cycle) return res.json({ cycle: null, requests: [] });
  const requests = unwrap(await supabase.from('student_preference_change_requests').select('*').eq('cycle_id', cycle.id).eq('status', 'pending').order('created_at'));
  const studentIds = [...new Set(requests.map((request) => request.student_id))];
  const students = studentIds.length ? unwrap(await supabase.from('users').select('id,full_name,email').in('id', studentIds)) : [];
  const studentsById = Object.fromEntries(students.map((student) => [student.id, student]));
  res.json({ cycle, requests: requests.map((request) => ({ ...request, student: studentsById[request.student_id] ?? null })) });
});

const preferenceLockSchema = z.object({ locked: z.boolean() });

router.patch('/cycles/:id/preference-lock', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const parsed = preferenceLockSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [cycle] = unwrap(await supabase.from('internship_cycles').update({ preference_changes_locked: parsed.data.locked }).eq('id', req.params.id).select('id,name,preference_changes_locked'));
  if (!cycle) return res.status(404).json({ error: 'internship cycle not found' });
  await logAudit({ actorId: req.user.id, actorRole: 'crcs_superadmin', action: parsed.data.locked ? 'lock_track_preferences' : 'unlock_track_preferences', entityType: 'internship_cycles', entityId: cycle.id, newValue: { preference_changes_locked: cycle.preference_changes_locked } });
  res.json(cycle);
});

// Operational locks are deliberately separate from the cycle preference lock.
// Both CRCS roles may operate them; faculty and students can neither unlock nor
// alter the lock record.  The audit row is the immutable history of each state
// transition, while portal_locks stores only the current state.
const portalLockSchema = z.object({
  locked: z.boolean(),
  reason: z.string().trim().max(1000).optional(),
});
const bulkPortalLockSchema = portalLockSchema.extend({
  subject_type: z.enum(['student', 'faculty']),
  cycle_id: z.string().uuid(),
});

const LOCK_MANAGER_ROLES = ['crcs_superadmin', 'crcs_coordinator', 'hod', 'faculty_coordinator'];

function isSystemLockManager(req) {
  return req.user.roles.some((role) => ['crcs_superadmin', 'crcs_coordinator'].includes(role.role));
}

async function canManageLockSubject(req, lockType, subjectId) {
  if (isSystemLockManager(req)) return true;
  const table = lockType === LOCK_TYPE.STUDENT_PORTAL ? 'students' : 'faculty';
  const subject = unwrap(await supabase.from(table).select('department_id').eq('id', subjectId).maybeSingle());
  if (!subject) return false;
  return scopeToDepartment(req).departmentIds?.includes(subject.department_id) ?? false;
}

async function lockDirectory(req) {
  const [studentsResult, facultyResult, locksResult] = await Promise.all([
    supabase.from('students').select('id,roll_number,department_id'),
    supabase.from('faculty').select('id,department_id,mentorship_scope'),
    supabase.from('portal_locks').select('*').order('updated_at', { ascending: false }),
  ]);
  const students = unwrap(studentsResult);
  const faculty = unwrap(facultyResult);
  const locks = unwrap(locksResult);
  const personIds = [...new Set([...students, ...faculty].map((person) => person.id))];
  const people = personIds.length
    ? unwrap(await supabase.from('users').select('id,full_name,email,is_active').in('id', personIds).order('full_name'))
    : [];
  const personById = Object.fromEntries(people.map((person) => [person.id, person]));
  const allowed = (person) => isSystemLockManager(req) || scopeToDepartment(req).departmentIds?.includes(person.department_id);
  return {
    students: students.filter(allowed).map((student) => ({ ...student, ...personById[student.id] })),
    faculty: faculty.filter(allowed).map((member) => ({ ...member, ...personById[member.id] })),
    locks,
  };
}

router.get('/locks', requireAuth, requireRole(...LOCK_MANAGER_ROLES), async (req, res) => {
  res.json(await lockDirectory(req));
});

// The lock dialog searches people as the manager types.  Do not send the full
// directory to the browser: a CRCS installation can have thousands of people.
const lockPeopleSearchSchema = z.object({
  type: z.enum(['student', 'faculty']),
  q: z.string().trim().min(2).max(100),
});

router.get('/locks/people', requireAuth, requireRole(...LOCK_MANAGER_ROLES), async (req, res) => {
  const parsed = lockPeopleSearchSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'type and a search of at least two characters are required' });

  // Treat wildcard characters as ordinary input so a broad wildcard cannot turn
  // a focused picker into a full-directory query.
  const term = parsed.data.q.replace(/[%_]/g, '').trim();
  if (term.length < 2) return res.json([]);
  const pattern = `%${term}%`;
  const profileTable = parsed.data.type === 'student' ? 'students' : 'faculty';
  const profileFields = parsed.data.type === 'student' ? 'id,roll_number,department_id' : 'id,department_id';
  const rollSearch = parsed.data.type === 'student'
    ? supabase.from('students').select('id,roll_number,department_id').ilike('roll_number', pattern).limit(25)
    : Promise.resolve({ data: [], error: null });
  const [byNameResult, byEmailResult, byRollNumberResult] = await Promise.all([
    supabase.from('users').select('id,full_name,email').eq('is_active', true).ilike('full_name', pattern).order('full_name').limit(25),
    supabase.from('users').select('id,full_name,email').eq('is_active', true).ilike('email', pattern).order('full_name').limit(25),
    rollSearch,
  ]);
  const peopleById = new Map([...unwrap(byNameResult), ...unwrap(byEmailResult)].map((person) => [person.id, person]));
  const profilesById = new Map(unwrap(byRollNumberResult).map((profile) => [profile.id, profile]));
  const rollOnlyIds = [...profilesById.keys()].filter((id) => !peopleById.has(id));
  if (rollOnlyIds.length) {
    const people = unwrap(await supabase.from('users').select('id,full_name,email').eq('is_active', true).in('id', rollOnlyIds));
    people.forEach((person) => peopleById.set(person.id, person));
  }
  const candidateIds = [...peopleById.keys()];
  if (!candidateIds.length) return res.json([]);

  const profileIdsToLoad = candidateIds.filter((id) => !profilesById.has(id));
  if (profileIdsToLoad.length) {
    const profiles = unwrap(await supabase.from(profileTable).select(profileFields).in('id', profileIdsToLoad));
    profiles.forEach((profile) => profilesById.set(profile.id, profile));
  }
  const profiles = [...profilesById.values()];
  const permitted = profiles.filter((profile) => isSystemLockManager(req) || scopeToDepartment(req).departmentIds?.includes(profile.department_id));
  res.json(permitted.slice(0, 20).map((profile) => ({
    ...peopleById.get(profile.id),
    ...(parsed.data.type === 'student' ? { roll_number: profile.roll_number } : {}),
  })));
});

router.post('/locks/bulk-cycle', requireAuth, requireRole(...LOCK_MANAGER_ROLES), async (req, res) => {
  const parsed = bulkPortalLockSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const cycle = unwrap(await supabase.from('internship_cycles').select('id').eq('id', parsed.data.cycle_id).maybeSingle());
  if (!cycle) return res.status(404).json({ error: 'internship cycle not found' });
  const departmentIds = isSystemLockManager(req) ? null : (scopeToDepartment(req).departmentIds ?? []);
  const [result] = unwrap(await supabase.rpc('bulk_set_cycle_portal_locks', {
    p_cycle_id: cycle.id,
    p_subject_type: parsed.data.subject_type,
    p_locked: parsed.data.locked,
    p_reason: parsed.data.reason || null,
    p_actor_id: req.user.id,
    p_actor_role: crcsActorRole(req.user),
    p_department_ids: departmentIds,
  }));
  res.json(result ?? { affected_people: 0, changed_locks: 0 });
});

router.get('/locks/audit', requireAuth, requireRole(...LOCK_MANAGER_ROLES), async (_req, res) => {
  const rows = unwrap(await supabase.from('audit_log').select('*')
    .eq('entity_type', 'portal_locks').order('created_at', { ascending: false }).limit(200));
  const actorIds = [...new Set(rows.map((row) => row.actor_id).filter(Boolean))];
  const actors = actorIds.length
    ? unwrap(await supabase.from('users').select('id,full_name,email').in('id', actorIds))
    : [];
  const actorById = Object.fromEntries(actors.map((actor) => [actor.id, actor]));
  res.json(rows.map((row) => ({ ...row, actor: actorById[row.actor_id] ?? null })));
});

router.get('/locks/me', requireAuth, requireRole('student', 'faculty'), async (req, res) => {
  const locks = unwrap(await supabase.from('portal_locks').select('*').eq('subject_id', req.user.id).eq('is_locked', true));
  const lockIds = locks.map((lock) => lock.id);
  const requests = lockIds.length ? unwrap(await supabase.from('portal_unlock_requests').select('*').eq('requested_by', req.user.id).in('lock_id', lockIds).order('created_at', { ascending: false })) : [];
  res.json({ locks, requests });
});

const unlockRequestSchema = z.object({ reason: z.string().trim().min(3, 'explain why access is needed').max(1000) });

router.post('/locks/:id/unlock-requests', requireAuth, requireRole('student', 'faculty'), async (req, res) => {
  const parsed = unlockRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const lock = unwrap(await supabase.from('portal_locks').select('*').eq('id', req.params.id).maybeSingle());
  if (!lock || !lock.is_locked) return res.status(404).json({ error: 'active lock not found' });
  if (lock.subject_id !== req.user.id) return res.status(403).json({ error: 'you may request an unlock only for your own portal or faculty workspace' });
  const pending = unwrap(await supabase.from('portal_unlock_requests').select('id').eq('lock_id', lock.id).eq('requested_by', req.user.id).eq('status', 'pending').maybeSingle());
  if (pending) return res.status(409).json({ error: 'an unlock request for this lock is already pending' });
  const [request] = unwrap(await supabase.from('portal_unlock_requests').insert({ lock_id: lock.id, requested_by: req.user.id, reason: parsed.data.reason }).select());
  await logAudit({ actorId: req.user.id, actorRole: req.user.roles.find((role) => ['student', 'faculty'].includes(role.role))?.role, action: 'request_portal_unlock', entityType: 'portal_unlock_requests', entityId: request.id, newValue: { lock_id: lock.id, lock_type: lock.lock_type, reason: request.reason } });
  res.status(201).json(request);
});

router.get('/unlock-requests', requireAuth, requireRole(...LOCK_MANAGER_ROLES), async (req, res) => {
  const requests = unwrap(await supabase.from('portal_unlock_requests').select('*, portal_locks(*)').eq('status', 'pending').order('created_at'));
  const scoped = [];
  for (const request of requests) if (request.portal_locks && await canManageLockSubject(req, request.portal_locks.lock_type, request.portal_locks.subject_id)) scoped.push(request);
  const requesterIds = [...new Set(scoped.map((request) => request.requested_by))];
  const people = requesterIds.length ? unwrap(await supabase.from('users').select('id,full_name,email').in('id', requesterIds)) : [];
  const personById = Object.fromEntries(people.map((person) => [person.id, person]));
  res.json(scoped.map((request) => ({ ...request, requester: personById[request.requested_by] ?? null })));
});

const unlockDecisionSchema = z.object({ decision: z.enum(['approve', 'reject']), reason: z.string().trim().max(1000).optional() });

router.patch('/unlock-requests/:id', requireAuth, requireRole(...LOCK_MANAGER_ROLES), async (req, res) => {
  const parsed = unlockDecisionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const request = unwrap(await supabase.from('portal_unlock_requests').select('*, portal_locks(*)').eq('id', req.params.id).maybeSingle());
  if (!request) return res.status(404).json({ error: 'unlock request not found' });
  if (request.status !== 'pending') return res.status(409).json({ error: 'this unlock request has already been decided' });
  if (!request.portal_locks || !(await canManageLockSubject(req, request.portal_locks.lock_type, request.portal_locks.subject_id))) return res.status(403).json({ error: 'this lock is outside your management scope' });
  const now = new Date().toISOString();
  const [updated] = unwrap(await supabase.from('portal_unlock_requests').update({ status: parsed.data.decision === 'approve' ? 'approved' : 'rejected', reviewed_by: req.user.id, reviewed_at: now, decision_reason: parsed.data.reason || null }).eq('id', request.id).select());
  if (parsed.data.decision === 'approve') {
    unwrap(await supabase.from('portal_locks').update({ is_locked: false, reason: parsed.data.reason || request.portal_locks.reason, unlocked_by: req.user.id, unlocked_at: now, updated_at: now }).eq('id', request.lock_id));
  }
  await logAudit({ actorId: req.user.id, actorRole: crcsActorRole(req.user), action: `${parsed.data.decision}_portal_unlock_request`, entityType: 'portal_unlock_requests', entityId: request.id, oldValue: { status: request.status, lock_id: request.lock_id }, newValue: { status: updated.status, decision_reason: updated.decision_reason } });
  res.json(updated);
});

router.patch('/locks/:lockType/:subjectId', requireAuth, requireRole(...LOCK_MANAGER_ROLES), async (req, res) => {
  const parsed = portalLockSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const lockType = req.params.lockType;
  if (!Object.values(LOCK_TYPE).includes(lockType)) return res.status(400).json({ error: 'invalid lock type' });
  if (!z.string().uuid().safeParse(req.params.subjectId).success) return res.status(400).json({ error: 'invalid subject id' });

  const target = unwrap(await supabase.from(lockType === LOCK_TYPE.STUDENT_PORTAL ? 'students' : 'faculty')
    .select('id').eq('id', req.params.subjectId).maybeSingle());
  if (!target) return res.status(404).json({ error: lockType === LOCK_TYPE.STUDENT_PORTAL ? 'student not found' : 'faculty member not found' });
  if (!(await canManageLockSubject(req, lockType, target.id))) return res.status(403).json({ error: 'this person is outside your lock-management scope' });

  const oldLock = unwrap(await supabase.from('portal_locks').select('*')
    .eq('lock_type', lockType).eq('subject_id', target.id).maybeSingle());
  if (oldLock?.is_locked === parsed.data.locked) {
    return res.json({ lock: oldLock, unchanged: true });
  }
  const now = new Date().toISOString();
  const common = {
    lock_type: lockType,
    subject_id: target.id,
    is_locked: parsed.data.locked,
    reason: parsed.data.reason || null,
    updated_at: now,
  };
  const payload = parsed.data.locked
    ? { ...common, locked_by: req.user.id, locked_at: now, unlocked_by: null, unlocked_at: null }
    : { ...common, unlocked_by: req.user.id, unlocked_at: now };
  const [lock] = unwrap(await supabase.from('portal_locks').upsert(payload, { onConflict: 'lock_type,subject_id' }).select());
  const actorRole = crcsActorRole(req.user);
  await logAudit({
    actorId: req.user.id,
    actorRole,
    action: parsed.data.locked ? `lock_${lockType}` : `unlock_${lockType}`,
    entityType: 'portal_locks',
    entityId: lock.id,
    oldValue: oldLock ? { is_locked: oldLock.is_locked, reason: oldLock.reason, updated_at: oldLock.updated_at } : null,
    newValue: { subject_id: target.id, lock_type: lockType, is_locked: lock.is_locked, reason: lock.reason, changed_at: now },
  });
  res.json({ lock });
});

const preferenceRequestDecisionSchema = z.object({ decision: z.enum(['approve', 'reject']) });

router.patch('/preference-change-requests/:id', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const parsed = preferenceRequestDecisionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const request = unwrap(await supabase.from('student_preference_change_requests').select('*').eq('id', req.params.id).maybeSingle());
  if (!request) return res.status(404).json({ error: 'preference-change request not found' });
  if (request.status !== 'pending') return res.status(409).json({ error: 'this request has already been decided' });
  const now = new Date().toISOString();
  if (parsed.data.decision === 'approve') {
    unwrap(await supabase.from('student_track_selections').delete().eq('student_id', request.student_id).eq('cycle_id', request.cycle_id));
    unwrap(await supabase.from('student_track_selections').insert({ student_id: request.student_id, cycle_id: request.cycle_id, track: request.requested_track }));
  }
  const [updated] = unwrap(await supabase.from('student_preference_change_requests').update({ status: parsed.data.decision === 'approve' ? 'approved' : 'rejected', reviewed_by: req.user.id, reviewed_at: now }).eq('id', request.id).select());
  await logAudit({ actorId: req.user.id, actorRole: 'crcs_superadmin', action: parsed.data.decision === 'approve' ? 'approve_track_change' : 'reject_track_change', entityType: 'student_preference_change_requests', entityId: request.id, oldValue: { current_track: request.current_track }, newValue: { requested_track: request.requested_track, status: updated.status } });
  res.json(updated);
});

router.get('/student-records', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const students = unwrap(await supabase.from('users').select('id,full_name,email,phone,is_active').order('full_name'));
  const studentRoles = students.length
    ? unwrap(await supabase.from('user_roles').select('user_id').eq('role', 'student').in('user_id', students.map((student) => student.id)))
    : [];
  const studentIds = [...new Set(studentRoles.map((role) => role.user_id))];
  if (!studentIds.length) return res.json({ cycle: null, records: [] });

  const currentCycle = unwrap(await supabase.from('internship_cycles').select('id,name').eq('status', 'open').order('preference_window_opens_at', { ascending: false }).limit(1).maybeSingle());
  const [profilesResult, selectionResult, documentsResult, researchResult, opportunityResult, selfInternshipResult, reportTemplatesResult, reportDeadlinesResult, mentorAssignmentsResult] = await Promise.all([
    supabase.from('students').select('id,roll_number,batch_year,cgpa,category,department_id').in('id', studentIds),
    currentCycle
      ? supabase.from('student_track_selections').select('student_id,track,created_at').eq('cycle_id', currentCycle.id).in('student_id', studentIds).order('created_at', { ascending: false })
      : supabase.from('student_track_selections').select('student_id,track,created_at').in('student_id', studentIds).order('created_at', { ascending: false }),
    supabase.from('documents').select('id,student_id,file_name,file_path,related_entity_type,uploaded_at,review_status,week_number,report_template_id,report_deadline_id').in('student_id', studentIds).order('uploaded_at', { ascending: false }),
    supabase.from('research_applications').select('id,student_id,project_id,status,updated_at,created_at').in('student_id', studentIds).order('updated_at', { ascending: false }),
    supabase.from('opportunity_applications').select('id,student_id,opportunity_id,status,assigned_mentor_id,updated_at,created_at').in('student_id', studentIds).order('updated_at', { ascending: false }),
    supabase.from('self_internships').select('id,student_id,company_name,status,assigned_mentor_id,updated_at,created_at').in('student_id', studentIds).order('updated_at', { ascending: false }),
    supabase.from('report_templates').select('id,name'),
    supabase.from('report_deadlines').select('id,title,report_template_id'),
    supabase.from('mentor_assignments').select('research_application_id,faculty_id').eq('is_current', true),
  ]);
  const profiles = unwrap(profilesResult);
  const selections = unwrap(selectionResult);
  const documents = await Promise.all(unwrap(documentsResult).map(async (document) => ({ ...document, url: await getSignedUrl(document.file_path) })));
  const researchApplications = unwrap(researchResult);
  const opportunityApplications = unwrap(opportunityResult);
  const selfInternships = unwrap(selfInternshipResult);
  const reportTemplates = unwrap(reportTemplatesResult);
  const reportDeadlines = unwrap(reportDeadlinesResult);
  const mentorAssignments = unwrap(mentorAssignmentsResult);
  const researchProjectIds = [...new Set(researchApplications.map((application) => application.project_id).filter(Boolean))];
  const opportunityIds = [...new Set(opportunityApplications.map((application) => application.opportunity_id).filter(Boolean))];
  const [projectsResult, opportunitiesResult] = await Promise.all([
    researchProjectIds.length ? supabase.from('research_projects').select('id,title').in('id', researchProjectIds) : { data: [], error: null },
    opportunityIds.length ? supabase.from('crcs_opportunities').select('id,title,organization_name').in('id', opportunityIds) : { data: [], error: null },
  ]);
  const profileById = Object.fromEntries(profiles.map((profile) => [profile.id, profile]));
  const selectionByStudent = {};
  selections.forEach((selection) => { if (!selectionByStudent[selection.student_id]) selectionByStudent[selection.student_id] = selection; });
  const documentsByStudent = Object.groupBy(documents, (document) => document.student_id);
  const researchByStudent = {};
  researchApplications.forEach((application) => { if (!researchByStudent[application.student_id]) researchByStudent[application.student_id] = application; });
  const opportunitiesByStudent = {};
  opportunityApplications.forEach((application) => { if (!opportunitiesByStudent[application.student_id]) opportunitiesByStudent[application.student_id] = application; });
  const selfInternshipsByStudent = {};
  selfInternships.forEach((internship) => { if (!selfInternshipsByStudent[internship.student_id]) selfInternshipsByStudent[internship.student_id] = internship; });
  const projectById = Object.fromEntries(unwrap(projectsResult).map((project) => [project.id, project]));
  const opportunityById = Object.fromEntries(unwrap(opportunitiesResult).map((opportunity) => [opportunity.id, opportunity]));
  const reportTemplateById = Object.fromEntries(reportTemplates.map((template) => [template.id, template]));
  const reportDeadlineById = Object.fromEntries(reportDeadlines.map((deadline) => [deadline.id, deadline]));
  const mentorByResearchApplication = Object.fromEntries(mentorAssignments.map((assignment) => [assignment.research_application_id, assignment.faculty_id]));
  const departmentIds = [...new Set(profiles.map((profile) => profile.department_id).filter(Boolean))];
  const [departmentsResult, organisationRolesResult, facultyCoordinatorAssignmentsResult] = await Promise.all([
    departmentIds.length ? supabase.from('departments').select('id,name,code,school_id').in('id', departmentIds) : { data: [], error: null },
    supabase.from('user_roles').select('user_id,role,department_id,school_id').in('role', ['dean', 'hod', 'faculty_coordinator']),
    supabase.from('faculty_coordinator_assignments').select('coordinator_id,faculty_id'),
  ]);
  const departments = unwrap(departmentsResult);
  const organisationRoles = unwrap(organisationRolesResult);
  const facultyCoordinatorAssignments = unwrap(facultyCoordinatorAssignmentsResult);
  const schoolIds = [...new Set(departments.map((department) => department.school_id).filter(Boolean))];
  const schools = schoolIds.length ? unwrap(await supabase.from('schools').select('id,name,code').in('id', schoolIds)) : [];
  const userById = Object.fromEntries(students.map((user) => [user.id, user]));
  const departmentById = Object.fromEntries(departments.map((department) => [department.id, department]));
  const schoolById = Object.fromEntries(schools.map((school) => [school.id, school]));
  const deanBySchool = Object.fromEntries(organisationRoles.filter((role) => role.role === 'dean' && role.school_id).map((role) => [role.school_id, role.user_id]));
  const hodByDepartment = Object.fromEntries(organisationRoles.filter((role) => role.role === 'hod' && role.department_id).map((role) => [role.department_id, role.user_id]));
  const coordinatorByFaculty = Object.fromEntries(facultyCoordinatorAssignments.map((assignment) => [assignment.faculty_id, assignment.coordinator_id]));
  const personSummary = (id) => id && userById[id] ? { id, full_name: userById[id].full_name, email: userById[id].email } : null;

  const internshipFor = (studentId) => {
    const preference = selectionByStudent[studentId];
    const research = researchByStudent[studentId] ? { path: 'research', status: researchByStudent[studentId].status, title: projectById[researchByStudent[studentId].project_id]?.title ?? 'Research internship', mentor_id: mentorByResearchApplication[researchByStudent[studentId].id] ?? null, reports_ready: researchByStudent[studentId].status === 'crcs_approved' } : null;
    const opportunity = opportunitiesByStudent[studentId] ? { path: 'crcs_opportunity', status: opportunitiesByStudent[studentId].status, title: opportunityById[opportunitiesByStudent[studentId].opportunity_id]?.title ?? 'CRCS opportunity', organization_name: opportunityById[opportunitiesByStudent[studentId].opportunity_id]?.organization_name ?? null, mentor_id: opportunitiesByStudent[studentId].assigned_mentor_id, reports_ready: opportunitiesByStudent[studentId].status === 'crcs_approved' && Boolean(opportunitiesByStudent[studentId].assigned_mentor_id) } : null;
    const selfInternship = selfInternshipsByStudent[studentId] ? { path: 'self_internship', status: selfInternshipsByStudent[studentId].status, title: selfInternshipsByStudent[studentId].company_name, mentor_id: selfInternshipsByStudent[studentId].assigned_mentor_id, reports_ready: selfInternshipsByStudent[studentId].status === 'active' && Boolean(selfInternshipsByStudent[studentId].assigned_mentor_id) } : null;
    const candidates = [research, opportunity, selfInternship].filter(Boolean);
    const approved = candidates.find((item) => item.status === 'crcs_approved' || item.status === 'active');
    const preferred = candidates.find((item) => item.path === preference?.track);
    return approved ?? preferred ?? candidates[0] ?? (preference ? { path: preference.track, status: 'preference_saved', title: 'No application submitted', reports_ready: false } : null);
  };

  const reportsFor = (studentId, internship) => {
    const categories = { weekly: [], midterm: [], synopsis: [], final: [] };
    (documentsByStudent[studentId] ?? []).forEach((document) => {
      const deadline = reportDeadlineById[document.report_deadline_id];
      const template = reportTemplateById[document.report_template_id ?? deadline?.report_template_id];
      const label = [document.file_name, deadline?.title, template?.name].filter(Boolean).join(' ').toLowerCase();
      const category = document.week_number || /weekly|week\s*\d/i.test(label) ? 'weekly'
        : /mid[-\s]?term|midterm/i.test(label) ? 'midterm'
          : /synopsis/i.test(label) ? 'synopsis'
            : /final|thesis|completion/i.test(label) ? 'final' : null;
      if (category) categories[category].push(document);
    });
    const waitingLabel = internship?.reports_ready ? 'Waiting for submission' : internship ? 'Waiting for approval or mentor' : 'No internship selected';
    return Object.fromEntries(Object.entries(categories).map(([key, items]) => [key, items.length
      ? { state: 'submitted', count: items.length, latest_at: items[0].uploaded_at, files: items.map((document) => ({ id: document.id, file_name: document.file_name, url: document.url })) }
      : { state: internship?.reports_ready ? 'waiting' : 'locked', count: 0, label: waitingLabel }]));
  };
  const organisationFor = (studentId, internship) => {
    const department = departmentById[profileById[studentId]?.department_id] ?? null;
    const school = department ? schoolById[department.school_id] ?? null : null;
    const mentor = personSummary(internship?.mentor_id);
    return { department, school, dean: personSummary(deanBySchool[school?.id]), hod: personSummary(hodByDepartment[department?.id]), faculty_mentor: mentor, faculty_coordinator: personSummary(coordinatorByFaculty[mentor?.id]) };
  };

  res.json({
    cycle: currentCycle,
    records: students.filter((student) => studentIds.includes(student.id)).map((student) => {
      const internship = internshipFor(student.id);
      return { student, profile: profileById[student.id] ?? null, preference: selectionByStudent[student.id] ?? null, internship, organisation: organisationFor(student.id, internship), reports: reportsFor(student.id, internship), documents: documentsByStudent[student.id] ?? [] };
    }),
  });
});

const permissionsSchema = z.object({
  permissions: z.array(z.object({ permission_key: z.string(), granted: z.boolean() })),
});

router.get('/crcs-coordinator-permissions/me', requireAuth, requireRole('crcs_coordinator', 'crcs_superadmin'), async (req, res) => {
  const rows = req.user.roles.some((role) => role.role === 'crcs_superadmin')
    ? []
    : unwrap(await supabase.from('crcs_coordinator_permissions').select('permission_key,granted').eq('coordinator_id', req.user.id));
  res.json({ permissions: Object.fromEntries(rows.map((row) => [row.permission_key, row.granted])) });
});

router.put('/admin/crcs-coordinator-permissions/:user_id', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const parsed = permissionsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { user_id } = req.params;
  for (const p of parsed.data.permissions) {
    unwrap(await supabase.from('crcs_coordinator_permissions').upsert(
      { coordinator_id: user_id, permission_key: p.permission_key, granted: p.granted, granted_by: req.user.id, updated_at: new Date().toISOString() },
      { onConflict: 'coordinator_id,permission_key' }
    ));
  }
  await logAudit({
    actorId: req.user.id, actorRole: 'crcs_superadmin', action: 'update_crcs_coordinator_permissions',
    entityType: 'crcs_coordinator_permissions', entityId: user_id, newValue: parsed.data.permissions,
  });
  res.json({ user_id, permissions: parsed.data.permissions });
});

router.get('/audit-log', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const { entity_type, entity_id } = req.query;
  let query = supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(200);
  if (entity_type) query = query.eq('entity_type', entity_type);
  if (entity_id) query = query.eq('entity_id', entity_id);
  res.json(unwrap(await query));
});

export default router;
