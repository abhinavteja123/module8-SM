import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { supabase, unwrap } from '../db/client.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';
import { getSignedUrl, saveFile } from '../lib/storage.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const OVERSIGHT_ROLES = ['crcs_superadmin', 'crcs_coordinator', 'hod', 'faculty_coordinator', 'dean', 'school_office'];

function hasOversightAccess(req) {
  return req.user.roles.some((role) => OVERSIGHT_ROLES.includes(role.role));
}

async function accessibleCycle(req, cycleId) {
  const cycle = unwrap(await supabase.from('internship_cycles').select('id,name,status').eq('id', cycleId).maybeSingle());
  if (!cycle) return null;
  if (hasOversightAccess(req)) return cycle;
  // ponytail: same rule as GET /cycles — any authenticated user can reach the
  // currently open cycle's guideline docs (that's the cycle they're being
  // asked to acknowledge right now), participant enrolment only gates access
  // to past/closed cycles.
  if (cycle.status === 'open') return cycle;
  const membership = unwrap(await supabase.from('cycle_participants').select('id').eq('cycle_id', cycleId).eq('user_id', req.user.id).maybeSingle());
  return membership ? cycle : null;
}

async function currentDocuments(cycleId) {
  return unwrap(await supabase.from('cycle_guideline_documents').select('*').eq('cycle_id', cycleId).is('retired_at', null).order('created_at'));
}

async function documentsWithAcknowledgement(cycleId, userId) {
  const documents = await currentDocuments(cycleId);
  const ids = documents.map((document) => document.id);
  const acknowledgements = ids.length
    ? unwrap(await supabase.from('cycle_guideline_acknowledgements').select('document_id,agreed_at').eq('cycle_id', cycleId).eq('user_id', userId).in('document_id', ids))
    : [];
  const acknowledgementByDocument = Object.fromEntries(acknowledgements.map((item) => [item.document_id, item]));
  return Promise.all(documents.map(async (document) => ({
    ...document,
    url: await getSignedUrl(document.file_path),
    acknowledgement: acknowledgementByDocument[document.id] ?? null,
  })));
}

function pdfUploadIsValid(file) {
  return file && (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf'));
}

router.get('/cycle-documents/:cycleId', requireAuth, async (req, res) => {
  const cycle = await accessibleCycle(req, req.params.cycleId);
  if (!cycle) return res.status(403).json({ error: 'this cycle is outside your workspace' });
  res.json({ cycle, documents: await documentsWithAcknowledgement(cycle.id, req.user.id) });
});

router.get('/cycle-documents/:cycleId/status', requireAuth, async (req, res) => {
  const cycle = await accessibleCycle(req, req.params.cycleId);
  if (!cycle) return res.status(403).json({ error: 'this cycle is outside your workspace' });
  const documents = await documentsWithAcknowledgement(cycle.id, req.user.id);
  const required = documents.filter((document) => document.is_required);
  const pending = required.filter((document) => !document.acknowledgement);
  res.json({
    cycle,
    documents,
    pending_document_ids: pending.map((document) => document.id),
    awaiting_documents: required.length === 0,
    acknowledged: required.length > 0 && pending.length === 0,
  });
});

// CRCS uses this compact aggregate in the cycle review; it deliberately does
// not expose individual acknowledgement records outside the superadmin role.
router.get('/cycle-documents/:cycleId/progress', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const cycle = unwrap(await supabase.from('internship_cycles').select('id,name,status').eq('id', req.params.cycleId).maybeSingle());
  if (!cycle) return res.status(404).json({ error: 'internship cycle not found' });
  const documents = (await currentDocuments(cycle.id)).filter((document) => document.is_required);
  const ids = documents.map((document) => document.id);
  const [participantsResult, acknowledgements] = await Promise.all([
    supabase.from('cycle_participants').select('user_id', { count: 'exact', head: true }).eq('cycle_id', cycle.id),
    ids.length ? supabase.from('cycle_guideline_acknowledgements').select('document_id').eq('cycle_id', cycle.id).in('document_id', ids) : Promise.resolve({ data: [], error: null }),
  ]);
  const acknowledgementCount = unwrap(acknowledgements).reduce((counts, row) => ({ ...counts, [row.document_id]: (counts[row.document_id] ?? 0) + 1 }), {});
  res.json({
    cycle,
    participant_count: participantsResult.count ?? 0,
    documents: documents.map((document) => ({ id: document.id, title: document.title, version: document.version, acknowledgement_count: acknowledgementCount[document.id] ?? 0 })),
  });
});

const uploadFieldsSchema = z.object({
  title: z.string().trim().min(1).max(200),
  is_required: z.enum(['true', 'false']).optional(),
  replaces_document_id: z.string().uuid().optional(),
});

router.post('/cycle-documents/:cycleId', requireAuth, requireRole('crcs_superadmin'), upload.single('file'), async (req, res) => {
  const parsed = uploadFieldsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!pdfUploadIsValid(req.file)) return res.status(400).json({ error: 'upload a PDF document (maximum 25 MB)' });
  const cycle = unwrap(await supabase.from('internship_cycles').select('id,status').eq('id', req.params.cycleId).maybeSingle());
  if (!cycle) return res.status(404).json({ error: 'internship cycle not found' });

  let replacement = null;
  if (parsed.data.replaces_document_id) {
    replacement = unwrap(await supabase.from('cycle_guideline_documents').select('*').eq('id', parsed.data.replaces_document_id).eq('cycle_id', cycle.id).is('retired_at', null).maybeSingle());
    if (!replacement) return res.status(404).json({ error: 'the current document to replace was not found in this cycle' });
  }
  if (cycle.status !== 'not_started' && !(cycle.status === 'open' && replacement)) {
    return res.status(409).json({ error: 'add documents while the cycle is a draft; an open cycle only permits replacing an existing document' });
  }
  const { filePath } = await saveFile({
    buffer: req.file.buffer,
    originalName: req.file.originalname,
    studentId: `cycle-guidelines/${cycle.id}`,
  });
  const [document] = unwrap(await supabase.from('cycle_guideline_documents').insert({
    cycle_id: cycle.id,
    title: parsed.data.title,
    file_path: filePath,
    file_name: req.file.originalname,
    is_required: parsed.data.is_required !== 'false',
    version: replacement ? replacement.version + 1 : 1,
    replaces_document_id: replacement?.id ?? null,
    uploaded_by: req.user.id,
  }).select());
  if (replacement) unwrap(await supabase.from('cycle_guideline_documents').update({ retired_at: new Date().toISOString() }).eq('id', replacement.id));
  await logAudit({
    actorId: req.user.id, actorRole: 'crcs_superadmin', action: replacement ? 'replace_cycle_guideline_document' : 'upload_cycle_guideline_document',
    entityType: 'cycle_guideline_documents', entityId: document.id, newValue: { cycle_id: cycle.id, title: document.title, version: document.version, is_required: document.is_required },
  });
  res.status(201).json({ ...document, url: await getSignedUrl(document.file_path) });
});

const documentUpdateSchema = z.object({ title: z.string().trim().min(1).max(200).optional(), is_required: z.boolean().optional() }).refine((body) => Object.keys(body).length > 0, 'supply a title or required setting');

router.patch('/cycle-documents/:cycleId/:documentId', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const parsed = documentUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const cycle = unwrap(await supabase.from('internship_cycles').select('id,status').eq('id', req.params.cycleId).maybeSingle());
  if (!cycle) return res.status(404).json({ error: 'internship cycle not found' });
  if (cycle.status !== 'not_started') return res.status(409).json({ error: 'documents can only be changed while the cycle is a draft' });
  const [document] = unwrap(await supabase.from('cycle_guideline_documents').update(parsed.data).eq('id', req.params.documentId).eq('cycle_id', cycle.id).is('retired_at', null).select());
  if (!document) return res.status(404).json({ error: 'current cycle document not found' });
  await logAudit({ actorId: req.user.id, actorRole: 'crcs_superadmin', action: 'update_cycle_guideline_document', entityType: 'cycle_guideline_documents', entityId: document.id, newValue: parsed.data });
  res.json(document);
});

const acknowledgementSchema = z.object({ agree: z.literal(true) });

router.post('/cycle-documents/:cycleId/:documentId/acknowledgements', requireAuth, async (req, res) => {
  const parsed = acknowledgementSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'explicit agreement is required' });
  const cycle = await accessibleCycle(req, req.params.cycleId);
  if (!cycle) return res.status(403).json({ error: 'this cycle is outside your workspace' });
  const document = unwrap(await supabase.from('cycle_guideline_documents').select('id,cycle_id,title,is_required').eq('id', req.params.documentId).eq('cycle_id', cycle.id).is('retired_at', null).maybeSingle());
  if (!document) return res.status(404).json({ error: 'current cycle document not found' });
  const [acknowledgement] = unwrap(await supabase.from('cycle_guideline_acknowledgements').upsert({ cycle_id: cycle.id, document_id: document.id, user_id: req.user.id }, { onConflict: 'document_id,user_id' }).select());
  await logAudit({ actorId: req.user.id, actorRole: req.user.roles[0]?.role, action: 'acknowledge_cycle_guideline_document', entityType: 'cycle_guideline_documents', entityId: document.id, newValue: { cycle_id: cycle.id, agreed_at: acknowledgement.agreed_at } });
  res.status(201).json(acknowledgement);
});

export default router;
