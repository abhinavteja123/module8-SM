import { Router } from 'express';
import { z } from 'zod';
import { supabase, unwrap } from '../db/client.js';
import { requireAuth, requirePlatformAdmin } from '../middleware/auth.js';
import { createPortalUser } from '../lib/users.js';

const router = Router();

router.get('/universities', requireAuth, requirePlatformAdmin, async (req, res) => {
  res.json(unwrap(await supabase.from('universities').select('id,name,code,created_at').order('name')));
});

const createUniversitySchema = z.object({
  university_name: z.string().trim().min(1),
  university_code: z.string().trim().min(1),
  admin_email: z.string().trim().toLowerCase().email(),
  admin_password: z.string().min(8),
  admin_full_name: z.string().trim().min(1),
});

router.post('/universities', requireAuth, requirePlatformAdmin, async (req, res) => {
  const parsed = createUniversitySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { university_name, university_code, admin_email, admin_password, admin_full_name } = parsed.data;
  const [university] = unwrap(await supabase.from('universities').insert({ name: university_name, code: university_code }).select());
  try {
    const admin = await createPortalUser({
      email: admin_email, password: admin_password, full_name: admin_full_name,
      roles: [{ role: 'crcs_superadmin' }], university_id: university.id,
    });
    res.status(201).json({ university, admin: { id: admin.id, email: admin.email, full_name: admin.full_name } });
  } catch (error) {
    await supabase.from('universities').delete().eq('id', university.id);
    throw error;
  }
});

export default router;
