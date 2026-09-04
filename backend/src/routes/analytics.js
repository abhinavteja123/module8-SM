import { Router } from 'express';
import { pool } from '../db/client.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

async function aggregates(deptWhere, deptParams) {
  const [students, research, opportunities, self, pendingDocs, avgMarks] = await Promise.all([
    pool.query(`SELECT COUNT(*) FROM students s WHERE ${deptWhere}`, deptParams),
    pool.query(
      `SELECT ra.status, COUNT(*) FROM research_applications ra
       JOIN students s ON s.id = ra.student_id WHERE ${deptWhere} GROUP BY ra.status`,
      deptParams
    ),
    pool.query(
      `SELECT oa.status, COUNT(*) FROM opportunity_applications oa
       JOIN students s ON s.id = oa.student_id WHERE ${deptWhere} GROUP BY oa.status`,
      deptParams
    ),
    pool.query(
      `SELECT si.status, COUNT(*) FROM self_internships si
       JOIN students s ON s.id = si.student_id WHERE ${deptWhere} GROUP BY si.status`,
      deptParams
    ),
    pool.query(
      `SELECT COUNT(*) FROM documents d
       JOIN students s ON s.id = d.student_id WHERE d.review_status = 'pending' AND ${deptWhere}`,
      deptParams
    ),
    pool.query(
      `SELECT AVG(m.weekly_report_score) weekly_report_score, AVG(m.mid_marks) mid_marks,
              AVG(m.synopsis_marks) synopsis_marks, AVG(m.thesis_marks) thesis_marks,
              AVG(m.ppt_marks) ppt_marks, AVG(m.viva_marks) viva_marks
       FROM marks m JOIN students s ON s.id = m.student_id WHERE ${deptWhere}`,
      deptParams
    ),
  ]);
  return {
    total_students: Number(students.rows[0].count),
    research_applications_by_status: Object.fromEntries(research.rows.map((r) => [r.status, Number(r.count)])),
    opportunity_applications_by_status: Object.fromEntries(opportunities.rows.map((r) => [r.status, Number(r.count)])),
    self_internships_by_status: Object.fromEntries(self.rows.map((r) => [r.status, Number(r.count)])),
    documents_pending_review: Number(pendingDocs.rows[0].count),
    average_marks: avgMarks.rows[0],
  };
}

router.get('/department/:department_id', requireAuth, requireRole('hod', 'faculty_coordinator'), async (req, res) => {
  const { department_id } = req.params;
  const ownsDept = req.user.roles.some(
    (r) => (r.role === 'hod' || r.role === 'faculty_coordinator') && r.department_id === department_id
  );
  if (!ownsDept) return res.status(403).json({ error: 'not scoped to this department' });
  const data = await aggregates('s.department_id = $1', [department_id]);
  res.json(data);
});

router.get('/school/:school_id', requireAuth, requireRole('dean'), async (req, res) => {
  const { school_id } = req.params;
  const ownsSchool = req.user.roles.some((r) => r.role === 'dean' && r.school_id === school_id);
  if (!ownsSchool) return res.status(403).json({ error: 'not scoped to this school' });
  const data = await aggregates(
    's.department_id IN (SELECT id FROM departments WHERE school_id = $1)',
    [school_id]
  );
  res.json(data);
});

router.get('/system', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const data = await aggregates('true', []);
  res.json(data);
});

export default router;
