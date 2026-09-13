import { Router } from 'express';
import { z } from 'zod';
import { supabase, unwrap } from '../db/client.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { requireStudentPortalUnlocked } from '../lib/portalLocks.js';

const router = Router();

function hasUniversityScope(req, res) {
  if (req.user?.university_id) return true;
  res.status(409).json({ error: 'Your account is not assigned to an organisation yet.' });
  return false;
}

router.get('/schools', requireAuth, async (req, res) => {
  if (!hasUniversityScope(req, res)) return;
  res.json(unwrap(await supabase.from('schools').select('*').eq('university_id', req.user.university_id).order('name')));
});

const organisationIdentitySchema = z.object({
  name: z.string().trim().min(1),
  code: z.string().trim().min(1).transform((code) => code.toUpperCase()),
});
const idSchema = z.string().uuid();

async function scopedSchool(schoolId, universityId) {
  return unwrap(await supabase.from('schools').select('id,name,code').eq('id', schoolId).eq('university_id', universityId).maybeSingle());
}

async function scopedDepartment(departmentId, universityId) {
  return unwrap(await supabase.from('departments').select('id,name,code,school_id,schools!inner(university_id)').eq('id', departmentId).eq('schools.university_id', universityId).maybeSingle());
}

async function countRows(query) {
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

router.post('/schools', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  if (!hasUniversityScope(req, res)) return;
  const parsed = organisationIdentitySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [school] = unwrap(await supabase.from('schools').insert({ ...parsed.data, university_id: req.user.university_id }).select());
  res.status(201).json(school);
});

router.patch('/schools/:schoolId', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  if (!hasUniversityScope(req, res)) return;
  const id = idSchema.safeParse(req.params.schoolId);
  const parsed = organisationIdentitySchema.safeParse(req.body);
  if (!id.success || !parsed.success) return res.status(400).json({ error: (id.success ? parsed.error : id.error).flatten() });
  if (!(await scopedSchool(id.data, req.user.university_id))) return res.status(404).json({ error: 'school not found' });
  const school = unwrap(await supabase.from('schools').update(parsed.data).eq('id', id.data).eq('university_id', req.user.university_id).select().maybeSingle());
  res.json(school);
});

router.delete('/schools/:schoolId', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  if (!hasUniversityScope(req, res)) return;
  const id = idSchema.safeParse(req.params.schoolId);
  if (!id.success) return res.status(400).json({ error: id.error.flatten() });
  if (!(await scopedSchool(id.data, req.user.university_id))) return res.status(404).json({ error: 'school not found' });
  const [departmentCount, roleCount, participantCount] = await Promise.all([
    countRows(supabase.from('departments').select('id', { count: 'exact', head: true }).eq('school_id', id.data)),
    countRows(supabase.from('user_roles').select('id', { count: 'exact', head: true }).eq('school_id', id.data)),
    countRows(supabase.from('cycle_participants').select('id', { count: 'exact', head: true }).eq('school_id', id.data)),
  ]);
  if (departmentCount || roleCount || participantCount) return res.status(409).json({ error: 'Remove or reassign this school’s departments, people, and cycle records before deleting it.' });
  const { error } = await supabase.from('schools').delete().eq('id', id.data).eq('university_id', req.user.university_id);
  if (error) throw new Error(error.message);
  res.status(204).end();
});

router.get('/departments', requireAuth, async (req, res) => {
  if (!hasUniversityScope(req, res)) return;
  // departments carry no university_id of their own; scope via their school.
  const schools = unwrap(await supabase.from('schools').select('id').eq('university_id', req.user.university_id));
  const schoolIds = schools.map((school) => school.id);
  let query = supabase.from('departments').select('*').in('school_id', schoolIds).order('name');
  if (req.query.school_id) query = query.eq('school_id', req.query.school_id);
  res.json(schoolIds.length ? unwrap(await query) : []);
});

const departmentSchema = organisationIdentitySchema.extend({ school_id: z.string().uuid() });

router.post('/departments', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  if (!hasUniversityScope(req, res)) return;
  const parsed = departmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const school = unwrap(await supabase.from('schools').select('id').eq('id', parsed.data.school_id).eq('university_id', req.user.university_id).maybeSingle());
  if (!school) return res.status(404).json({ error: 'school not found' });
  const [department] = unwrap(await supabase.from('departments').insert(parsed.data).select());
  res.status(201).json(department);
});

router.patch('/departments/:departmentId', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  if (!hasUniversityScope(req, res)) return;
  const id = idSchema.safeParse(req.params.departmentId);
  const parsed = organisationIdentitySchema.safeParse(req.body);
  if (!id.success || !parsed.success) return res.status(400).json({ error: (id.success ? parsed.error : id.error).flatten() });
  if (!(await scopedDepartment(id.data, req.user.university_id))) return res.status(404).json({ error: 'department not found' });
  const department = unwrap(await supabase.from('departments').update(parsed.data).eq('id', id.data).select().maybeSingle());
  res.json(department);
});

router.delete('/departments/:departmentId', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  if (!hasUniversityScope(req, res)) return;
  const id = idSchema.safeParse(req.params.departmentId);
  if (!id.success) return res.status(400).json({ error: id.error.flatten() });
  if (!(await scopedDepartment(id.data, req.user.university_id))) return res.status(404).json({ error: 'department not found' });
  const [roleCount, studentCount, facultyCount, coordinatorCount, participantCount] = await Promise.all([
    countRows(supabase.from('user_roles').select('id', { count: 'exact', head: true }).eq('department_id', id.data)),
    countRows(supabase.from('students').select('id', { count: 'exact', head: true }).eq('department_id', id.data)),
    countRows(supabase.from('faculty').select('id', { count: 'exact', head: true }).eq('department_id', id.data)),
    countRows(supabase.from('faculty_coordinator_assignments').select('id', { count: 'exact', head: true }).eq('department_id', id.data)),
    countRows(supabase.from('cycle_participants').select('id', { count: 'exact', head: true }).eq('department_id', id.data)),
  ]);
  if (roleCount || studentCount || facultyCount || coordinatorCount || participantCount) return res.status(409).json({ error: 'Remove or reassign this department’s people and cycle records before deleting it.' });
  const { error } = await supabase.from('departments').delete().eq('id', id.data);
  if (error) throw new Error(error.message);
  res.status(204).end();
});

router.get('/users/me', requireAuth, async (req, res) => {
  const user = unwrap(await supabase.from('users').select('id, email, full_name, phone, is_active').eq('id', req.user.id).maybeSingle());
  if (!user) return res.status(404).json({ error: 'not found' });
  res.json({ ...user, roles: req.user.roles, isPlatformAdmin: req.user.isPlatformAdmin, must_change_password: req.user.must_change_password });
});

router.get('/students/me/profile', requireAuth, requireRole('student'), async (req, res) => {
  const [user, student] = await Promise.all([
    supabase.from('users').select('id,email,full_name,phone').eq('id', req.user.id).maybeSingle(),
    supabase.from('students').select('id,roll_number,batch_year,cgpa,category,department_id').eq('id', req.user.id).maybeSingle(),
  ]);
  const userRow = unwrap(user);
  const studentRow = unwrap(student);
  if (!userRow || !studentRow) return res.status(404).json({ error: 'student profile not found' });
  const department = studentRow.department_id ? unwrap(await supabase.from('departments').select('id,name,code,school_id').eq('id', studentRow.department_id).maybeSingle()) : null;
  const school = department?.school_id ? unwrap(await supabase.from('schools').select('id,name,code').eq('id', department.school_id).maybeSingle()) : null;
  res.json({ ...userRow, ...studentRow, department: department ? { ...department, school } : null });
});

const studentProfileSchema = z.object({
  phone: z.string().trim().max(30).nullable().optional(),
  cgpa: z.coerce.number().min(0, 'CGPA cannot be below 0').max(10, 'CGPA cannot be above 10'),
  category: z.string().trim().max(100).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'provide at least one profile field to update' });

router.patch('/students/me/profile', requireAuth, requireRole('student'), async (req, res) => {
  const parsed = studentProfileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!(await requireStudentPortalUnlocked(req, res))) return;
  const existing = unwrap(await supabase.from('students').select('id').eq('id', req.user.id).maybeSingle());
  if (!existing) return res.status(404).json({ error: 'student profile not found' });
  const { phone, cgpa, category } = parsed.data;
  const now = new Date().toISOString();
  if (phone !== undefined) unwrap(await supabase.from('users').update({ phone, updated_at: now }).eq('id', req.user.id));
  const studentChanges = {};
  if (cgpa !== undefined) studentChanges.cgpa = cgpa;
  if (category !== undefined) studentChanges.category = category;
  if (Object.keys(studentChanges).length) unwrap(await supabase.from('students').update(studentChanges).eq('id', req.user.id));
  const [user, student] = await Promise.all([
    supabase.from('users').select('id,email,full_name,phone').eq('id', req.user.id).maybeSingle(),
    supabase.from('students').select('id,roll_number,batch_year,cgpa,category,department_id').eq('id', req.user.id).maybeSingle(),
  ]);
  res.json({ ...unwrap(user), ...unwrap(student) });
});

export default router;
