import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../db/client.js';
import { requireAuth, requireRole, scopeToDepartment } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';
import { notify } from '../lib/notifications.js';

const router = Router();

// ---------- projects ----------

router.get('/projects', requireAuth, async (req, res) => {
  const { cycle_id, department_id } = req.query;
  const { departmentIds, schoolIds, isSystemWide } = scopeToDepartment(req);

  const conditions = [];
  const params = [];
  if (cycle_id) { params.push(cycle_id); conditions.push(`p.cycle_id = $${params.length}`); }
  if (department_id) { params.push(department_id); conditions.push(`f.department_id = $${params.length}`); }
  if (!isSystemWide) {
    if (schoolIds) {
      params.push(schoolIds); conditions.push(`d.school_id = ANY($${params.length})`);
    } else if (departmentIds) {
      params.push(departmentIds); conditions.push(`f.department_id = ANY($${params.length})`);
    }
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT p.*, u.full_name AS faculty_name, f.department_id
     FROM research_projects p
     JOIN faculty f ON f.id = p.faculty_id
     JOIN users u ON u.id = f.id
     JOIN departments d ON d.id = f.department_id
     ${where}
     ORDER BY p.created_at DESC`,
    params
  );
  res.json(rows);
});

const projectSchema = z.object({
  cycle_id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().min(1),
  max_students: z.number().int().min(1).max(4).optional(),
});

router.post('/projects', requireAuth, requireRole('faculty'), async (req, res) => {
  const parsed = projectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { cycle_id, title, description, max_students } = parsed.data;
  const { rows: [project] } = await pool.query(
    `INSERT INTO research_projects (faculty_id, cycle_id, title, description, max_students)
     VALUES ($1,$2,$3,$4,COALESCE($5,4)) RETURNING *`,
    [req.user.id, cycle_id, title, description, max_students ?? null]
  );
  res.status(201).json(project);
});

const projectPatchSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
}).refine((v) => Object.keys(v).length > 0, { message: 'no fields to update' });

router.patch('/projects/:id', requireAuth, requireRole('faculty'), async (req, res) => {
  const parsed = projectPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { rows: [project] } = await pool.query('SELECT * FROM research_projects WHERE id = $1', [req.params.id]);
  if (!project) return res.status(404).json({ error: 'not found' });
  if (project.faculty_id !== req.user.id) return res.status(403).json({ error: 'not your project' });
  // §4.1 lock rule: once >=1 approved student, title/description/scope are immutable.
  if (project.status === 'locked' || project.status === 'full') {
    return res.status(403).json({ error: 'project is locked — core fields immutable once a student is approved' });
  }

  const fields = parsed.data;
  const sets = Object.keys(fields).map((k, i) => `${k} = $${i + 1}`);
  const values = Object.values(fields);
  values.push(req.params.id);
  const { rows: [updated] } = await pool.query(
    `UPDATE research_projects SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length} RETURNING *`,
    values
  );
  res.json(updated);
});

// ---------- applications ----------

const applicationSchema = z.object({ project_id: z.string().uuid() });

router.post('/applications', requireAuth, requireRole('student'), async (req, res) => {
  const parsed = applicationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { rows: [application] } = await pool.query(
    `INSERT INTO research_applications (student_id, project_id) VALUES ($1,$2) RETURNING *`,
    [req.user.id, parsed.data.project_id]
  );
  res.status(201).json(application);
});

const decisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  reason: z.string().optional(),
});

router.patch('/applications/:id/faculty-decision', requireAuth, requireRole('faculty'), async (req, res) => {
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { decision, reason } = parsed.data;

  try {
    const result = await withTransaction(async (db) => {
      const { rows: [application] } = await db.query(
        `SELECT ra.*, rp.faculty_id FROM research_applications ra
         JOIN research_projects rp ON rp.id = ra.project_id
         WHERE ra.id = $1 FOR UPDATE`,
        [req.params.id]
      );
      if (!application) { const e = new Error('not found'); e.status = 404; throw e; }
      if (application.faculty_id !== req.user.id) { const e = new Error('not your project'); e.status = 403; throw e; }
      if (application.status !== 'pending_faculty') { const e = new Error('application already decided'); e.status = 409; throw e; }

      if (decision === 'approve') {
        const { rows: [updated] } = await db.query(
          `UPDATE research_applications
           SET status = 'pending_crcs_approval', faculty_decision_by = $1, faculty_decision_at = now(), updated_at = now()
           WHERE id = $2 RETURNING *`,
          [req.user.id, application.id]
        );
        // §4.0/§7.1: auto-revoke this student's other pending research applications.
        const { rows: revoked } = await db.query(
          `UPDATE research_applications
           SET status = 'revoked', rejection_reason = 'auto-revoked: student approved elsewhere', updated_at = now()
           WHERE student_id = $1 AND id != $2 AND status = 'pending_faculty'
           RETURNING id, student_id`,
          [application.student_id, application.id]
        );
        await logAudit(db, {
          actorId: req.user.id, actorRole: 'faculty', action: 'approve_research_application_faculty',
          entityType: 'research_applications', entityId: application.id, oldValue: { status: application.status }, newValue: updated,
        });
        return { updated, revoked };
      }

      const { rows: [updated] } = await db.query(
        `UPDATE research_applications
         SET status = 'rejected', rejected_by_role = 'faculty', rejected_at_stage = 'faculty',
             rejection_reason = $1, faculty_decision_by = $2, faculty_decision_at = now(), updated_at = now()
         WHERE id = $3 RETURNING *`,
        [reason ?? null, req.user.id, application.id]
      );
      await logAudit(db, {
        actorId: req.user.id, actorRole: 'faculty', action: 'reject_research_application_faculty',
        entityType: 'research_applications', entityId: application.id, oldValue: { status: application.status }, newValue: updated,
      });
      return { updated, revoked: [] };
    });

    await notify(pool, {
      userId: result.updated.student_id,
      title: decision === 'approve' ? 'Faculty approved your research application' : 'Faculty rejected your research application',
      body: reason ?? null,
      relatedEntityType: 'research_application',
      relatedEntityId: result.updated.id,
    });
    for (const r of result.revoked) {
      await notify(pool, {
        userId: r.student_id,
        title: 'Application auto-revoked',
        body: 'Another of your research applications was approved, so this one was auto-revoked.',
        relatedEntityType: 'research_application',
        relatedEntityId: r.id,
      });
    }
    res.json(result.updated);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

router.patch('/applications/:id/crcs-decision', requireAuth, requireRole('crcs_superadmin', 'crcs_coordinator'), async (req, res) => {
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { decision, reason } = parsed.data;
  const actorRole = req.user.roles.find((r) => ['crcs_superadmin', 'crcs_coordinator'].includes(r.role)).role;

  try {
    const result = await withTransaction(async (db) => {
      const { rows: [application] } = await db.query(
        `SELECT * FROM research_applications WHERE id = $1 FOR UPDATE`,
        [req.params.id]
      );
      if (!application) { const e = new Error('not found'); e.status = 404; throw e; }
      if (application.status !== 'pending_crcs_approval') { const e = new Error('application not awaiting CRCS decision'); e.status = 409; throw e; }

      if (decision === 'approve') {
        const { rows: [updated] } = await db.query(
          `UPDATE research_applications
           SET status = 'crcs_approved', crcs_decision_by = $1, crcs_decision_at = now(), updated_at = now()
           WHERE id = $2 RETURNING *`,
          [req.user.id, application.id]
        );

        const { rows: [project] } = await db.query(
          `SELECT * FROM research_projects WHERE id = $1 FOR UPDATE`,
          [updated.project_id]
        );
        const newApprovedCount = project.approved_count + 1;
        const newStatus = newApprovedCount >= 4 ? 'full' : 'locked';
        await db.query(
          `UPDATE research_projects SET approved_count = $1, status = $2,
             locked_at = COALESCE(locked_at, now()), updated_at = now() WHERE id = $3`,
          [newApprovedCount, newStatus, project.id]
        );

        const { rows: [mentorAssignment] } = await db.query(
          `INSERT INTO mentor_assignments (student_id, research_application_id, faculty_id, is_current)
           VALUES ($1,$2,$3,true) RETURNING *`,
          [updated.student_id, updated.id, project.faculty_id]
        );

        // §4.0 cross-track exclusivity — self_internship is exempt.
        const { rows: revokedOpportunities } = await db.query(
          `UPDATE opportunity_applications
           SET status = 'revoked', rejection_reason = 'auto-revoked: student approved elsewhere', updated_at = now()
           WHERE student_id = $1 AND status IN ('applied','under_review','offered')
           RETURNING id, student_id`,
          [updated.student_id]
        );

        await logAudit(db, {
          actorId: req.user.id, actorRole, action: 'approve_research_application_crcs',
          entityType: 'research_applications', entityId: updated.id, oldValue: { status: application.status }, newValue: updated,
        });
        return { updated, mentorAssignment, revokedOpportunities };
      }

      const { rows: [updated] } = await db.query(
        `UPDATE research_applications
         SET status = 'rejected', rejected_by_role = $1, rejected_at_stage = 'crcs',
             rejection_reason = $2, crcs_decision_by = $3, crcs_decision_at = now(), updated_at = now()
         WHERE id = $4 RETURNING *`,
        [actorRole, reason ?? null, req.user.id, application.id]
      );
      await logAudit(db, {
        actorId: req.user.id, actorRole, action: 'reject_research_application_crcs',
        entityType: 'research_applications', entityId: updated.id, oldValue: { status: application.status }, newValue: updated,
      });
      return { updated, revokedOpportunities: [] };
    });

    await notify(pool, {
      userId: result.updated.student_id,
      title: decision === 'approve' ? 'CRCS approved your research internship' : 'CRCS rejected your research application',
      body: reason ?? null,
      relatedEntityType: 'research_application',
      relatedEntityId: result.updated.id,
    });
    for (const r of result.revokedOpportunities ?? []) {
      await notify(pool, {
        userId: r.student_id,
        title: 'Opportunity application auto-revoked',
        body: 'Your research internship was approved, so pending CRCS opportunity applications were auto-revoked.',
        relatedEntityType: 'opportunity_application',
        relatedEntityId: r.id,
      });
    }
    res.json(result.updated);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

// ---------- mentor reassignment ----------

const reassignSchema = z.object({ new_faculty_id: z.string().uuid(), reason: z.string().min(1) });

router.post('/mentor-assignments/:id/reassign', requireAuth, requireRole('faculty_coordinator', 'crcs_superadmin'), async (req, res) => {
  const parsed = reassignSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { new_faculty_id, reason } = parsed.data;

  try {
    const result = await withTransaction(async (db) => {
      const { rows: [current] } = await db.query(
        `SELECT * FROM mentor_assignments WHERE id = $1 AND is_current = true FOR UPDATE`,
        [req.params.id]
      );
      if (!current) { const e = new Error('active mentor assignment not found'); e.status = 404; throw e; }

      if (req.user.roles.some((r) => r.role === 'faculty_coordinator')) {
        const { rows: [assigned] } = await db.query(
          `SELECT 1 FROM faculty_coordinator_assignments WHERE coordinator_id = $1 AND faculty_id = $2`,
          [req.user.id, current.faculty_id]
        );
        if (!assigned) { const e = new Error('faculty is outside your assigned scope'); e.status = 403; throw e; }
      }

      await db.query(`UPDATE mentor_assignments SET is_current = false, ended_at = now() WHERE id = $1`, [current.id]);
      const { rows: [next] } = await db.query(
        `INSERT INTO mentor_assignments
           (student_id, research_application_id, faculty_id, is_current, reassigned_from, reassigned_by, reassignment_reason)
         VALUES ($1,$2,$3,true,$4,$5,$6) RETURNING *`,
        [current.student_id, current.research_application_id, new_faculty_id, current.id, req.user.id, reason]
      );

      await logAudit(db, {
        actorId: req.user.id, actorRole: req.user.roles.find((r) => ['faculty_coordinator', 'crcs_superadmin'].includes(r.role)).role,
        action: 'reassign_mentor', entityType: 'mentor_assignments', entityId: next.id,
        oldValue: { faculty_id: current.faculty_id }, newValue: { faculty_id: new_faculty_id, reason },
      });
      return next;
    });

    await notify(pool, {
      userId: result.student_id, title: 'Your mentor has been reassigned', body: reason,
      relatedEntityType: 'mentor_assignment', relatedEntityId: result.id,
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

// ---------- attendance ----------

const attendanceSchema = z.object({
  mentor_assignment_id: z.string().uuid(),
  week_number: z.number().int().min(1),
  present: z.boolean(),
});

router.post('/attendance', requireAuth, requireRole('faculty'), async (req, res) => {
  const parsed = attendanceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { mentor_assignment_id, week_number, present } = parsed.data;

  const { rows: [assignment] } = await pool.query(
    'SELECT faculty_id FROM mentor_assignments WHERE id = $1', [mentor_assignment_id]
  );
  if (!assignment) return res.status(404).json({ error: 'mentor assignment not found' });
  if (assignment.faculty_id !== req.user.id) return res.status(403).json({ error: 'not your mentee' });

  const { rows: [attendance] } = await pool.query(
    `INSERT INTO weekly_attendance (mentor_assignment_id, week_number, present, marked_by)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (mentor_assignment_id, week_number)
     DO UPDATE SET present = EXCLUDED.present, marked_by = EXCLUDED.marked_by, marked_at = now()
     RETURNING *`,
    [mentor_assignment_id, week_number, present, req.user.id]
  );
  res.status(201).json(attendance);
});

// ---------- dashboard ----------

router.get('/dashboard/:student_id', requireAuth, async (req, res) => {
  const { student_id } = req.params;
  const { departmentIds, schoolIds, isSystemWide } = scopeToDepartment(req);

  const isSelf = req.user.id === student_id;
  const isCrcs = req.user.roles.some((r) => ['crcs_superadmin', 'crcs_coordinator'].includes(r.role));
  if (!isSelf && !isCrcs && !isSystemWide) {
    const { rows: [student] } = await pool.query('SELECT department_id FROM students WHERE id = $1', [student_id]);
    if (!student) return res.status(404).json({ error: 'student not found' });
    const inScope =
      (departmentIds && departmentIds.includes(student.department_id)) ||
      (schoolIds && (await pool.query('SELECT 1 FROM departments WHERE id = $1 AND school_id = ANY($2)', [student.department_id, schoolIds])).rows.length);
    const isMentor = (await pool.query(
      `SELECT 1 FROM mentor_assignments WHERE student_id = $1 AND faculty_id = $2 AND is_current = true`,
      [student_id, req.user.id]
    )).rows.length;
    if (!inScope && !isMentor) return res.status(403).json({ error: 'out of scope' });
  }

  const { rows: [mentorAssignment] } = await pool.query(
    `SELECT ma.*, u.full_name AS faculty_name
     FROM mentor_assignments ma JOIN users u ON u.id = ma.faculty_id
     WHERE ma.student_id = $1 AND ma.is_current = true`,
    [student_id]
  );
  const { rows: [application] } = await pool.query(
    `SELECT ra.*, rp.title, rp.description FROM research_applications ra
     JOIN research_projects rp ON rp.id = ra.project_id
     WHERE ra.student_id = $1 AND ra.status = 'crcs_approved'
     ORDER BY ra.updated_at DESC LIMIT 1`,
    [student_id]
  );
  const documents = application
    ? (await pool.query(
        `SELECT * FROM documents WHERE related_entity_type = 'research_application' AND related_entity_id = $1 ORDER BY uploaded_at DESC`,
        [application.id]
      )).rows
    : [];
  const attendance = mentorAssignment
    ? (await pool.query(
        `SELECT * FROM weekly_attendance WHERE mentor_assignment_id = $1 ORDER BY week_number`,
        [mentorAssignment.id]
      )).rows
    : [];

  res.json({ mentorAssignment: mentorAssignment ?? null, application: application ?? null, documents, attendance });
});

export default router;
