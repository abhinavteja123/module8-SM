import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { pool } from '../db/client.js';
import { requireAuth, requireRole, scopeToDepartment } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';
import { notify } from '../lib/notifications.js';
import { saveFile, getSignedUrl } from '../lib/storage.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/report-templates', requireAuth, async (req, res) => {
  const { track } = req.query;
  const { rows } = track
    ? await pool.query('SELECT * FROM report_templates WHERE track IS NULL OR track = $1 ORDER BY created_at', [track])
    : await pool.query('SELECT * FROM report_templates ORDER BY created_at');
  res.json(rows);
});

const templateSchema = z.object({
  name: z.string().min(1),
  track: z.enum(['research', 'crcs_opportunity', 'self_internship']).optional(),
  schema: z.record(z.any()).optional(),
});

router.post('/report-templates', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const parsed = templateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { name, track, schema } = parsed.data;
  const { rows: [tpl] } = await pool.query(
    `INSERT INTO report_templates (name, track, is_default, schema, created_by)
     VALUES ($1,$2,false,$3,$4) RETURNING *`,
    [name, track ?? null, schema ? JSON.stringify(schema) : null, req.user.id]
  );
  res.status(201).json(tpl);
});

const uploadFieldsSchema = z.object({
  report_template_id: z.string().uuid().optional(),
  related_entity_type: z.enum(['research_application', 'self_internship', 'opportunity_application']),
  related_entity_id: z.string().uuid(),
  week_number: z.coerce.number().int().optional(),
});

router.post('/documents/upload', requireAuth, requireRole('student'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file is required (field "file")' });
  const parsed = uploadFieldsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { report_template_id, related_entity_type, related_entity_id, week_number } = parsed.data;

  const { filePath } = await saveFile({
    buffer: req.file.buffer,
    originalName: req.file.originalname,
    studentId: req.user.id,
  });

  const { rows: [doc] } = await pool.query(
    `INSERT INTO documents (student_id, report_template_id, related_entity_type, related_entity_id, file_path, file_name, week_number)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.user.id, report_template_id ?? null, related_entity_type, related_entity_id, filePath, req.file.originalname, week_number ?? null]
  );

  const url = await getSignedUrl(doc.file_path);
  res.status(201).json({ ...doc, url });
});

const reviewSchema = z.object({
  review_status: z.enum(['verified', 'revision_requested']),
  review_comment: z.string().optional(),
});

router.patch('/documents/:id/review', requireAuth, requireRole('faculty', 'crcs_coordinator', 'crcs_superadmin'), async (req, res) => {
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { review_status, review_comment } = parsed.data;

  const { rows: [doc] } = await pool.query('SELECT * FROM documents WHERE id = $1', [req.params.id]);
  if (!doc) return res.status(404).json({ error: 'not found' });

  const isFaculty = req.user.roles.some((r) => r.role === 'faculty');
  if (isFaculty && !req.user.roles.some((r) => r.role === 'crcs_superadmin' || r.role === 'crcs_coordinator')) {
    const { rows: [assignment] } = await pool.query(
      `SELECT 1 FROM mentor_assignments WHERE student_id = $1 AND faculty_id = $2 AND is_current = true`,
      [doc.student_id, req.user.id]
    );
    if (!assignment) return res.status(403).json({ error: 'not the current mentor for this student' });
  }

  const { rows: [updated] } = await pool.query(
    `UPDATE documents SET review_status = $1, review_comment = $2, reviewed_by = $3, reviewed_at = now()
     WHERE id = $4 RETURNING *`,
    [review_status, review_comment ?? null, req.user.id, req.params.id]
  );

  await notify(pool, {
    userId: doc.student_id,
    title: `Document ${review_status === 'verified' ? 'verified' : 'needs revision'}`,
    body: review_comment ?? null,
    relatedEntityType: 'document',
    relatedEntityId: doc.id,
  });
  await logAudit(pool, {
    actorId: req.user.id,
    actorRole: req.user.roles[0]?.role,
    action: 'review_document',
    entityType: 'documents',
    entityId: doc.id,
    oldValue: { review_status: doc.review_status },
    newValue: { review_status },
  });

  res.json(updated);
});

router.get('/documents', requireAuth, async (req, res) => {
  const { student_id, related_entity_id } = req.query;
  const roles = req.user.roles.map((r) => r.role);

  if (roles.includes('student') && student_id && student_id !== req.user.id) {
    return res.status(403).json({ error: 'students may only view their own documents' });
  }

  const conditions = [];
  const params = [];
  if (student_id) { params.push(student_id); conditions.push(`d.student_id = $${params.length}`); }
  if (related_entity_id) { params.push(related_entity_id); conditions.push(`d.related_entity_id = $${params.length}`); }

  if (!roles.includes('crcs_superadmin') && !roles.includes('crcs_coordinator') && !roles.includes('student')) {
    const scope = scopeToDepartment(req);
    if (!scope.isSystemWide) {
      if (scope.schoolIds?.length) {
        params.push(scope.schoolIds);
        conditions.push(`dept.school_id = ANY($${params.length})`);
      } else if (scope.departmentIds?.length) {
        params.push(scope.departmentIds);
        conditions.push(`s.department_id = ANY($${params.length})`);
      } else {
        return res.json([]);
      }
    }
  } else if (roles.includes('student')) {
    params.push(req.user.id);
    conditions.push(`d.student_id = $${params.length}`);
  }

  const { rows } = await pool.query(
    `SELECT d.* FROM documents d
     JOIN students s ON s.id = d.student_id
     JOIN departments dept ON dept.id = s.department_id
     ${conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''}
     ORDER BY d.uploaded_at DESC`,
    params
  );

  const withUrls = await Promise.all(rows.map(async (d) => ({ ...d, url: await getSignedUrl(d.file_path) })));
  res.json(withUrls);
});

export default router;
