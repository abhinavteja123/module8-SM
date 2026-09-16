import { Router } from 'express';
import { supabase, unwrap } from '../db/client.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const rows = unwrap(await supabase.from('notifications').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(50));
  res.json(rows);
});

router.get('/unread-count', requireAuth, async (req, res) => {
  const { count, error } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', req.user.id).eq('is_read', false);
  if (error) throw error;
  res.json({ count: count ?? 0 });
});

router.patch('/read-all', requireAuth, async (req, res) => {
  unwrap(await supabase.from('notifications').update({ is_read: true }).eq('user_id', req.user.id).eq('is_read', false).select('id'));
  res.json({ ok: true });
});

router.patch('/:id/read', requireAuth, async (req, res) => {
  const existing = unwrap(await supabase.from('notifications').select('id').eq('id', req.params.id).eq('user_id', req.user.id).maybeSingle());
  if (!existing) return res.status(404).json({ error: 'notification not found' });
  const [updated] = unwrap(await supabase.from('notifications').update({ is_read: true }).eq('id', req.params.id).select());
  res.json(updated);
});

export default router;
