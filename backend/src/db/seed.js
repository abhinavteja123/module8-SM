import bcrypt from 'bcryptjs';
import { pool } from './client.js';

const PASSWORD = 'Passw0rd!';

async function seed() {
  const hash = await bcrypt.hash(PASSWORD, 10);

  const { rows: [seas] } = await pool.query(
    `INSERT INTO schools (name, code) VALUES ('School of Engineering & Applied Sciences','SEAS') RETURNING id`
  );
  const { rows: [sob] } = await pool.query(
    `INSERT INTO schools (name, code) VALUES ('School of Business','SOB') RETURNING id`
  );

  const { rows: [cse] } = await pool.query(
    `INSERT INTO departments (school_id, name, code) VALUES ($1,'Computer Science & Engineering','CSE') RETURNING id`,
    [seas.id]
  );
  const { rows: [ece] } = await pool.query(
    `INSERT INTO departments (school_id, name, code) VALUES ($1,'Electronics & Communication','ECE') RETURNING id`,
    [seas.id]
  );
  await pool.query(
    `INSERT INTO departments (school_id, name, code) VALUES ($1,'Business Administration','BBA')`,
    [sob.id]
  );

  async function makeUser(email, full_name, role, { department_id = null, school_id = null } = {}) {
    const { rows: [u] } = await pool.query(
      `INSERT INTO users (email, password_hash, full_name) VALUES ($1,$2,$3) RETURNING id`,
      [email, hash, full_name]
    );
    await pool.query(
      `INSERT INTO user_roles (user_id, role, department_id, school_id) VALUES ($1,$2,$3,$4)`,
      [u.id, role, department_id, school_id]
    );
    return u.id;
  }

  const studentId = await makeUser('student@example.edu', 'Sam Student', 'student', { department_id: cse.id });
  await pool.query(
    `INSERT INTO students (id, roll_number, department_id, batch_year) VALUES ($1,'CSE2026001',$2,2026)`,
    [studentId, cse.id]
  );

  const facultyId = await makeUser('faculty@example.edu', 'Dr. Faye Culty', 'faculty', { department_id: cse.id });
  await pool.query(`INSERT INTO faculty (id, department_id, designation) VALUES ($1,$2,'Associate Professor')`, [facultyId, cse.id]);

  const coordId = await makeUser('coordinator@example.edu', 'Cory Coordinator', 'faculty_coordinator', { department_id: cse.id });
  await pool.query(`INSERT INTO faculty (id, department_id, designation) VALUES ($1,$2,'Professor')`, [coordId, cse.id]);
  await pool.query(
    `INSERT INTO faculty_coordinator_assignments (coordinator_id, faculty_id, department_id) VALUES ($1,$2,$3)`,
    [coordId, facultyId, cse.id]
  );

  await makeUser('hod@example.edu', 'Helen HOD', 'hod', { department_id: cse.id });
  const crcsCoordId = await makeUser('crcs.coordinator@example.edu', 'Chris CRCSCoord', 'crcs_coordinator');
  const superadminId = await makeUser('crcs.admin@example.edu', 'Ada Superadmin', 'crcs_superadmin');
  await makeUser('dean@example.edu', 'Dana Dean', 'dean', { school_id: seas.id });

  await pool.query(
    `INSERT INTO crcs_coordinator_permissions (coordinator_id, permission_key, granted, granted_by) VALUES
      ($1,'view_research_approvals', true, $2),
      ($1,'view_opportunities', true, $2),
      ($1,'view_marks', false, $2)`,
    [crcsCoordId, superadminId]
  );

  const { rows: [cycle] } = await pool.query(
    `INSERT INTO internship_cycles (name, preference_window_opens_at, preference_window_closes_at, status, created_by)
     VALUES ('2026 Summer Internship Cycle', now(), now() + interval '30 days', 'open', $1) RETURNING id`,
    [superadminId]
  );

  await pool.query(
    `INSERT INTO report_templates (name, track, is_default, created_by) VALUES
      ('Weekly Report', NULL, true, $1),
      ('Synopsis Report', NULL, true, $1),
      ('Final Report', NULL, true, $1)`,
    [superadminId]
  );

  console.log('[seed] done. All users password:', PASSWORD);
  console.log('[seed] cycle id:', cycle.id);
  await pool.end();
}

seed().catch((err) => {
  console.error('[seed] failed:', err.message);
  process.exit(1);
});
