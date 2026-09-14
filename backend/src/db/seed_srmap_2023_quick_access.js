import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { supabase, unwrap } from './client.js';
import { createPortalUser } from '../lib/users.js';

const UNIVERSITY_CODE = 'SRMAP';
const CYCLE_NAME = '2023-2027';
const DEMO_SUFFIX = '@demo.srmap.test';
const seedPassword = process.env.DEMO_SEED_PASSWORD || `${randomBytes(24).toString('base64url')}Aa1!`;

async function ensureUser(data) {
  const existing = unwrap(await supabase.from('users').select('id').eq('email', data.email).maybeSingle());
  if (existing) return existing;
  return createPortalUser({ ...data, password: seedPassword });
}

async function main() {
  const university = unwrap(await supabase.from('universities').select('id,is_active').eq('code', UNIVERSITY_CODE).maybeSingle());
  if (!university?.is_active) throw new Error('SRM AP must exist and be active before demo quick access can be seeded.');
  const cycle = unwrap(await supabase.from('internship_cycles').select('id,status').eq('university_id', university.id).eq('name', CYCLE_NAME).maybeSingle());
  if (!cycle) throw new Error(`SRM AP cycle ${CYCLE_NAME} was not found.`);
  if (cycle.status !== 'open') throw new Error(`SRM AP cycle ${CYCLE_NAME} must be open for quick-access accounts.`);

  const school = unwrap(await supabase.from('schools').select('id').eq('university_id', university.id).eq('code', 'SEAS').maybeSingle());
  const department = school && unwrap(await supabase.from('departments').select('id,school_id').eq('school_id', school.id).eq('code', 'CSE').maybeSingle());
  if (!school || !department) throw new Error('SRM AP School of Engineering and CSE must exist before demo quick access can be seeded.');

  const superadmin = await ensureUser({
    email: `quick.superadmin${DEMO_SUFFIX}`, full_name: 'SRM AP Demo Superadmin',
    roles: [{ role: 'crcs_superadmin' }], university_id: university.id,
  });
  const coordinator = await ensureUser({
    email: `quick.coordinator${DEMO_SUFFIX}`, full_name: 'SRM AP Demo Coordinator',
    roles: [{ role: 'crcs_coordinator' }], university_id: university.id,
  });
  const facultyCoordinator = await ensureUser({
    email: `quick.faculty-coordinator${DEMO_SUFFIX}`, full_name: 'SRM AP Demo Faculty Coordinator',
    mentorship_scope: 'research', roles: [{ role: 'faculty_coordinator', department_id: department.id }], university_id: university.id,
  });
  const hod = await ensureUser({
    email: `quick.hod${DEMO_SUFFIX}`, full_name: 'SRM AP Demo CSE HOD',
    roles: [{ role: 'hod', department_id: department.id }], university_id: university.id,
  });
  const dean = await ensureUser({
    email: `quick.dean${DEMO_SUFFIX}`, full_name: 'SRM AP Demo Engineering Dean',
    roles: [{ role: 'dean', school_id: school.id }], university_id: university.id,
  });
  const schoolOffice = await ensureUser({
    email: `quick.school-office${DEMO_SUFFIX}`, full_name: 'SRM AP Demo School Office',
    roles: [{ role: 'school_office', school_id: school.id }], university_id: university.id,
  });

  const massAccounts = unwrap(await supabase.from('users')
    .select('id,email,user_roles!inner(role)')
    .eq('university_id', university.id)
    .ilike('email', 'bulk-test-20260911-%@example.edu')
    .order('email'));
  const students = massAccounts.filter((person) => person.user_roles.some((role) => role.role === 'student')).slice(0, 10);
  const faculty = massAccounts.filter((person) => person.user_roles.some((role) => role.role === 'faculty')).slice(0, 10);
  if (students.length !== 10 || faculty.length !== 10) throw new Error('The first ten imported SRM AP student and faculty demo accounts are unavailable.');

  const leadership = [
    [superadmin, 'crcs_superadmin', null, null], [coordinator, 'crcs_coordinator', null, null],
    [facultyCoordinator, 'faculty_coordinator', department.id, school.id], [hod, 'hod', department.id, school.id],
    [dean, 'dean', null, school.id], [schoolOffice, 'school_office', null, school.id],
  ];
  const participantRows = [
    ...leadership.map(([person, participant_type, department_id, school_id]) => ({ cycle_id: cycle.id, user_id: person.id, participant_type, department_id, school_id, source: 'existing', enrolled_by: superadmin.id })),
    ...students.map((person) => ({ cycle_id: cycle.id, user_id: person.id, participant_type: 'student', department_id: department.id, school_id: school.id, category: '2023 demo', source: 'bulk_import', enrolled_by: superadmin.id })),
    ...faculty.map((person) => ({ cycle_id: cycle.id, user_id: person.id, participant_type: 'faculty', department_id: department.id, school_id: school.id, category: '2023 demo', source: 'bulk_import', enrolled_by: superadmin.id })),
  ];
  unwrap(await supabase.from('cycle_participants').upsert(participantRows, { onConflict: 'cycle_id,user_id' }));
  const accountIds = [...leadership.map(([person]) => person.id), ...students.map((person) => person.id), ...faculty.map((person) => person.id)];
  unwrap(await supabase.from('users').update({ is_active: true, last_login_at: new Date().toISOString(), updated_at: new Date().toISOString() }).in('id', accountIds));
  const requiredDocuments = unwrap(await supabase.from('cycle_guideline_documents').select('id').eq('cycle_id', cycle.id).eq('is_required', true).is('retired_at', null));
  if (requiredDocuments.length) {
    unwrap(await supabase.from('cycle_guideline_acknowledgements').upsert(
      requiredDocuments.flatMap((document) => accountIds.map((user_id) => ({ cycle_id: cycle.id, document_id: document.id, user_id }))),
      { onConflict: 'document_id,user_id' },
    ));
  }

  console.log(JSON.stringify({ university: UNIVERSITY_CODE, cycle: CYCLE_NAME, students: students.length, faculty: faculty.length, oversightRoles: leadership.length, requiredDocumentsAcknowledged: requiredDocuments.length, quickAccessAccounts: accountIds.length }, null, 2));
}

main().catch((error) => {
  console.error('[seed:srmap-quick-access] failed:', error.message);
  process.exit(1);
});
