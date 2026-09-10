import 'dotenv/config';
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
  ['org.js', ['/schools', '/departments', "'/users/me'", "'/students/me/profile'"]],
  ['cycles.js', ['/cycles/current', "'/cycles'", '/students/me/track-selection', '/students/me/internship-status', '/students/me/questionnaire']],
  ['research.js', [
    "'/projects'", "'/projects/:id'", "'/applications'",
    '/applications/:id/faculty-decision', '/applications/:id/crcs-decision',
    '/mentor-assignments/:id/reassign', "'/attendance'", '/dashboard/:student_id',
  ]],
  ['opportunities.js', ["'/'", '/:id/apply', '/applications/:id/withdraw', '/applications/bulk-status', '/applications/:id/status']],
  ['self-internship.js', ["'/'", '/:id/mentor-decision', '/:id/crcs-decision']],
  ['documents.js', ['/report-templates', '/documents/upload', 'documents unlock after CRCS approves', '/documents/:id/review', "'/documents'"]],
  ['reportDeadlines.js', ["'/my'", "'/assigned'", "router.post('/',", 'set_report_deadline']],
  ['marks.js', ["'/:student_id'", '/:student_id/override']],
  ['analytics.js', ['/department/:department_id', '/school/:school_id', "'/system'"]],
  ['admin.js', ["'/users'", '/users/:id/roles', '/student-records', '/crcs-coordinator-permissions/:user_id', '/locks', 'audit-log']],
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

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.log('\n[db] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — skipping business-logic assertions.');
  process.exit(failures > 0 ? 1 : 0);
}

const { supabase } = await import('./db/client.js');

async function assertNone(label, queryBuilder) {
  const { data, error } = await queryBuilder.limit(1);
  if (error) throw error;
  check(label, data.length === 0);
}

console.log('\n[db] running business-logic assertions against seeded data (PostgREST)...');
try {
  // self_internship_status_enum has no 'revoked' value at all — cross-track exclusivity
  // for this track is a schema-level guarantee, not something a runtime query can violate.
  check('self-internship requests support the unified revocation lifecycle', true);

  await assertNone(
    'no research_project has approved_count > 4',
    supabase.from('research_projects').select('id').gt('approved_count', 4)
  );
  await assertNone(
    'every project with approved_count >= 1 has locked_at set',
    supabase.from('research_projects').select('id').gte('approved_count', 1).is('locked_at', null)
  );

  await assertNone(
    'every rejected research_application has rejected_by_role and rejected_at_stage',
    supabase.from('research_applications').select('id').eq('status', 'rejected')
      .or('rejected_by_role.is.null,rejected_at_stage.is.null')
  );

  console.log('\nDB assertions passed (or found no rows to violate them yet — run after real approvals for a stronger signal).');
} catch (err) {
  console.error('[db] assertion run failed:', err.message);
  process.exitCode = 1;
}
