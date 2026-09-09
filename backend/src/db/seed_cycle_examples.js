import 'dotenv/config';
import { supabase, unwrap } from './client.js';
import { createPortalUser } from '../lib/users.js';

const PASSWORD = 'Passw0rd!';
const EMPTY_CYCLE = 'Manual Setup Cycle · Empty';
const SAMPLE_CYCLE = 'Sample Cycle · 100 Participants';

async function ensureBy(table, filters, row) {
  let query = supabase.from(table).select('*');
  Object.entries(filters).forEach(([key, value]) => { query = query.eq(key, value); });
  const existing = unwrap(await query.maybeSingle());
  if (existing) return existing;
  const [created] = unwrap(await supabase.from(table).insert(row).select());
  return created;
}

async function ensureUser(data) {
  const existing = unwrap(await supabase.from('users').select('id').eq('email', data.email).maybeSingle());
  return existing ?? createPortalUser({ ...data, password: PASSWORD });
}

async function main() {
  const admin = unwrap(await supabase.from('users').select('id').eq('email', 'crcs.admin@example.edu').maybeSingle());
  if (!admin) throw new Error('Run npm run seed first so the CRCS demo administrator exists.');
  const departments = unwrap(await supabase.from('departments').select('id,code,school_id').in('code', ['CSE', 'ECE', 'PHY', 'MBA']));
  if (departments.length !== 4) throw new Error('Run npm run seed first so CSE, ECE, PHY, and MBA departments exist.');
  const departmentByCode = Object.fromEntries(departments.map((department) => [department.code, department]));

  const emptyCycle = await ensureBy('internship_cycles', { name: EMPTY_CYCLE }, {
    name: EMPTY_CYCLE,
    batch_label: 'Manual configuration',
    guidelines: 'This draft is intentionally empty. Add your own students, faculty, categories, and guidelines before publishing.',
    preference_window_opens_at: new Date('2026-10-01T00:00:00.000Z').toISOString(),
    preference_window_closes_at: new Date('2026-12-31T23:59:59.000Z').toISOString(),
    status: 'not_started',
    created_by: admin.id,
  });
  const sampleCycle = await ensureBy('internship_cycles', { name: SAMPLE_CYCLE }, {
    name: SAMPLE_CYCLE,
    batch_label: 'Demo cohort · 2027',
    guidelines: 'Sample data for testing. Students should submit preferences by 15 October. Faculty should publish project scopes and enter reviews/marks before their assigned deadlines.',
    preference_window_opens_at: new Date('2026-10-01T00:00:00.000Z').toISOString(),
    preference_window_closes_at: new Date('2026-12-31T23:59:59.000Z').toISOString(),
    status: 'not_started',
    created_by: admin.id,
  });

  const participants = [];
  const departmentCodes = ['CSE', 'ECE', 'PHY', 'MBA'];
  for (let index = 1; index <= 90; index += 1) {
    const code = departmentCodes[(index - 1) % departmentCodes.length];
    const department = departmentByCode[code];
    const user = await ensureUser({
      email: `sample.cycle.student.${String(index).padStart(3, '0')}@example.edu`,
      full_name: `Sample ${code} Student ${String(index).padStart(3, '0')}`,
      roll_number: `${code}2027${String(index).padStart(3, '0')}`,
      batch_year: 2027,
      roles: [{ role: 'student', department_id: department.id }],
    });
    participants.push({ cycle_id: sampleCycle.id, user_id: user.id, participant_type: 'student', category: `${code} · 2027`, department_id: department.id, school_id: department.school_id, source: 'bulk_import', enrolled_by: admin.id });
  }
  for (let index = 1; index <= 10; index += 1) {
    const code = departmentCodes[(index - 1) % departmentCodes.length];
    const department = departmentByCode[code];
    const user = await ensureUser({
      email: `sample.cycle.faculty.${String(index).padStart(2, '0')}@example.edu`,
      full_name: `Dr. Sample ${code} Faculty ${String(index).padStart(2, '0')}`,
      mentorship_scope: index % 2 ? 'research' : 'crcs_self',
      roles: [{ role: 'faculty', department_id: department.id }],
    });
    participants.push({ cycle_id: sampleCycle.id, user_id: user.id, participant_type: 'faculty', category: `${code} · Faculty`, department_id: department.id, school_id: department.school_id, source: 'bulk_import', enrolled_by: admin.id });
  }
  unwrap(await supabase.from('cycle_participants').upsert(participants, { onConflict: 'cycle_id,user_id' }));
  const sampleCount = await supabase.from('cycle_participants').select('id', { count: 'exact', head: true }).eq('cycle_id', sampleCycle.id);
  const emptyCount = await supabase.from('cycle_participants').select('id', { count: 'exact', head: true }).eq('cycle_id', emptyCycle.id);
  if (sampleCount.error) throw new Error(sampleCount.error.message);
  if (emptyCount.error) throw new Error(emptyCount.error.message);
  console.log(`[seed] ${emptyCycle.name}: ${emptyCount.count ?? 0} people (draft)`);
  console.log(`[seed] ${sampleCycle.name}: ${sampleCount.count ?? 0} people (90 students, 10 faculty; draft)`);
  console.log(`[seed] Sample-account password: ${PASSWORD}`);
}

main().then(() => process.exit(0)).catch((error) => { console.error('[seed] failed:', error.message); process.exit(1); });
