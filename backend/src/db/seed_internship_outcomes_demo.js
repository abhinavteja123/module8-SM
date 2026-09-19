import 'dotenv/config';
import { supabase, unwrap } from './client.js';

// ponytail: demo data only, so the new analytics section has something to
// show before real students start submitting outcomes. Deterministic hash
// (not random) so re-runs converge to the same values instead of reshuffling;
// upsert on (source_type, source_id) makes re-running safe.
const DOMAINS = ['Software & IT Services', 'Data Analytics', 'Core Engineering', 'Finance', 'Marketing'];

function hashOffset(id, max) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % max;
}

function outcomeFor(id, studentId, universityId, cycleId, sourceType) {
  const h = hashOffset(id, 100);
  const nature = h % 4 === 0 ? 'unpaid' : 'paid';
  return {
    student_id: studentId,
    university_id: universityId,
    cycle_id: cycleId,
    source_type: sourceType,
    source_id: id,
    mode: h % 3 === 0 ? 'offline' : 'online',
    nature,
    duration_months: 2 + (h % 4),
    stipend_amount: nature === 'paid' ? 5000 + h * 350 : null,
    company_country: 'India',
    domain_sector: DOMAINS[h % DOMAINS.length],
    submitted_by: studentId,
  };
}

async function main() {
  const selfInternships = unwrap(await supabase.from('self_internships').select('id,student_id,cycle_id,students(users(university_id))').in('status', ['active', 'completed']));
  const oppApplications = unwrap(await supabase.from('opportunity_applications').select('id,student_id,crcs_opportunities(cycle_id),students(users(university_id))').eq('status', 'crcs_approved'));

  const rows = [
    ...selfInternships.filter((r) => r.students?.users?.university_id).map((r) => outcomeFor(r.id, r.student_id, r.students.users.university_id, r.cycle_id, 'self_internship')),
    ...oppApplications.filter((r) => r.students?.users?.university_id && r.crcs_opportunities?.cycle_id).map((r) => outcomeFor(r.id, r.student_id, r.students.users.university_id, r.crcs_opportunities.cycle_id, 'crcs_opportunity')),
  ];

  if (!rows.length) { console.log('No eligible self_internships/opportunity_applications found — nothing to seed.'); return; }
  const { error } = await supabase.from('internship_outcomes').upsert(rows, { onConflict: 'source_type,source_id', ignoreDuplicates: true });
  if (error) throw error;
  console.log(`Seeded ${rows.length} internship_outcomes rows (self-internship: ${selfInternships.length}, crcs opportunity: ${oppApplications.length}).`);
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
