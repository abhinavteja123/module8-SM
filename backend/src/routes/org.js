import { Router } from 'express';
import { z } from 'zod';
import { supabase, unwrap } from '../db/client.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/schools', requireAuth, async (req, res) => {
  res.json(unwrap(await supabase.from('schools').select('*').order('name')));
});

const schoolSchema = z.object({ name: z.string().min(1), code: z.string().min(1) });

router.post('/schools', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const parsed = schoolSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [school] = unwrap(await supabase.from('schools').insert(parsed.data).select());
  res.status(201).json(school);
});

router.get('/departments', requireAuth, async (req, res) => {
  let query = supabase.from('departments').select('*').order('name');
  if (req.query.school_id) query = query.eq('school_id', req.query.school_id);
  res.json(unwrap(await query));
});

const departmentSchema = z.object({ school_id: z.string().uuid(), name: z.string().min(1), code: z.string().min(1) });

router.post('/departments', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const parsed = departmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [department] = unwrap(await supabase.from('departments').insert(parsed.data).select());
  res.status(201).json(department);
});

router.get('/users/me', requireAuth, async (req, res) => {
  const user = unwrap(await supabase.from('users').select('id, email, full_name, phone, is_active').eq('id', req.user.id).maybeSingle());
  if (!user) return res.status(404).json({ error: 'not found' });
  res.json({ ...user, roles: req.user.roles });
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
  cgpa: z.coerce.number().min(0, 'CGPA cannot be below 0').max(10, 'CGPA cannot be above 10').nullable().optional(),
  category: z.string().trim().max(100).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'provide at least one profile field to update' });

router.patch('/students/me/profile', requireAuth, requireRole('student'), async (req, res) => {
  const parsed = studentProfileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
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
