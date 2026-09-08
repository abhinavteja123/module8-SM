import { Router } from 'express';
import { supabase, unwrap } from '../db/client.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/department/:department_id', requireAuth, requireRole('hod', 'faculty_coordinator'), async (req, res) => {
  const { department_id } = req.params;
  const ownsDept = req.user.roles.some(
    (r) => (r.role === 'hod' || r.role === 'faculty_coordinator') && r.department_id === department_id
  );
  if (!ownsDept) return res.status(403).json({ error: 'not scoped to this department' });
  const data = unwrap(await supabase.rpc('analytics_department', { p_department_id: department_id }));
  res.json(data);
});

router.get('/school/:school_id', requireAuth, requireRole('dean'), async (req, res) => {
  const { school_id } = req.params;
  const ownsSchool = req.user.roles.some((r) => r.role === 'dean' && r.school_id === school_id);
  if (!ownsSchool) return res.status(403).json({ error: 'not scoped to this school' });
  const data = unwrap(await supabase.rpc('analytics_school', { p_school_id: school_id }));
  res.json(data);
});

router.get('/system', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const data = unwrap(await supabase.rpc('analytics_system', {}));
  res.json(data);
});

export default router;
