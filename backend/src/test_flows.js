import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = path.join(process.cwd());
const routesDir = path.join(root, 'src', 'routes');

function read(file) {
  return readFileSync(path.join(routesDir, file), 'utf8');
}

let failures = 0;
function check(label, cond) {
  if (cond) {
    console.log(`  ok   ${label}`);
  } else {
    console.error(`  FAIL ${label}`);
    failures++;
  }
}

console.log('[static] every §8 route mounted in its file:');
const routeChecks = [
  ['auth.js', ['/register', '/login', '/refresh', '/logout']],
  ['org.js', ['/schools', '/departments', "'/users/me'"]],
  ['cycles.js', ['/cycles/current', "'/cycles'", '/students/me/track-selection', '/students/me/questionnaire']],
  ['research.js', [
    "'/projects'", "'/projects/:id'", "'/applications'",
    '/applications/:id/faculty-decision', '/applications/:id/crcs-decision',
    '/mentor-assignments/:id/reassign', "'/attendance'", '/dashboard/:student_id',
  ]],
  ['opportunities.js', ["'/'", '/:id/apply', '/applications/:id/status']],
  ['self-internship.js', ["'/'", '/:id/mentor-decision', '/:id/crcs-decision']],
  ['documents.js', ['/report-templates', '/documents/upload', '/documents/:id/review', "'/documents'"]],
  ['marks.js', ["'/:student_id'", '/:student_id/override']],
  ['analytics.js', ['/department/:department_id', '/school/:school_id', "'/system'"]],
  ['admin.js', ["'/users'", '/users/:id/roles', '/crcs-coordinator-permissions/:user_id', 'audit-log']],
];

for (const [file, needles] of routeChecks) {
  const filePath = path.join(routesDir, file);
  if (!existsSync(filePath)) {
    check(`${file} exists`, false);
    continue;
  }
  const src = read(file);
  for (const needle of needles) {
    check(`${file} defines ${needle}`, src.includes(needle));
  }
}

console.log('\n[static] §5 server-side scoping on analytics routes:');
if (existsSync(path.join(routesDir, 'analytics.js'))) {
  const src = read('analytics.js');
  check('analytics.js imports scopeToDepartment or does explicit dept/school id match',
    src.includes('scopeToDepartment') || (src.includes('department_id') && src.includes('403')));
} else {
  check('analytics.js exists', false);
}

if (failures > 0) {
  console.error(`\n${failures} static check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log('\nAll static checks passed.');
}

if (!process.env.DATABASE_URL) {
  console.log('\n[db] DATABASE_URL not set — skipping business-logic assertions.');
  console.log('[db] To run them: set DATABASE_URL, `npm run migrate && npm run seed`, then `npm test` again.');
  process.exit(failures > 0 ? 1 : 0);
}

const { pool } = await import('./db/client.js');

async function assertRow(label, sql, params, predicate) {
  const { rows } = await pool.query(sql, params);
  const ok = predicate(rows);
  check(label, ok);
}

console.log('\n[db] running business-logic assertions against seeded data...');
try {
  await assertRow(
    'self_internships never carry status=revoked (exclusivity exemption)',
    `SELECT 1 FROM self_internships WHERE status = 'revoked' LIMIT 1`,
    [],
    (rows) => rows.length === 0
  );

  await assertRow(
    'no research_project has approved_count > 4',
    `SELECT 1 FROM research_projects WHERE approved_count > 4 LIMIT 1`,
    [],
    (rows) => rows.length === 0
  );
  await assertRow(
    'every project with approved_count >= 1 has locked_at set',
    `SELECT 1 FROM research_projects WHERE approved_count >= 1 AND locked_at IS NULL LIMIT 1`,
    [],
    (rows) => rows.length === 0
  );

  await assertRow(
    'every rejected research_application has rejected_by_role and rejected_at_stage',
    `SELECT 1 FROM research_applications WHERE status = 'rejected' AND (rejected_by_role IS NULL OR rejected_at_stage IS NULL) LIMIT 1`,
    [],
    (rows) => rows.length === 0
  );

  console.log('\nDB assertions passed (or found no rows to violate them yet — run after real approvals for a stronger signal).');
} catch (err) {
  console.error('[db] assertion run failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
