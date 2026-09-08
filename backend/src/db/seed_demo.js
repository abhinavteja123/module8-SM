import 'dotenv/config';
import { supabase, unwrap } from './client.js';
import { createPortalUser } from '../lib/users.js';
import { saveFile } from '../lib/storage.js';

const PASSWORD = 'Passw0rd!';
const DAY = 24 * 60 * 60 * 1000;

async function upsertOne(table, row, onConflict) {
  const [result] = unwrap(await supabase.from(table).upsert(row, { onConflict }).select());
  return result;
}

async function ensureUser(data) {
  const existing = unwrap(await supabase.from('users').select('id,email,full_name').eq('email', data.email).maybeSingle());
  return existing ?? createPortalUser({ ...data, password: PASSWORD });
}

async function ensureBy(table, filters, row) {
  let query = supabase.from(table).select('*');
  Object.entries(filters).forEach(([key, value]) => { query = query.eq(key, value); });
  const existing = unwrap(await query.maybeSingle());
  if (existing) return existing;
  const [created] = unwrap(await supabase.from(table).insert(row).select());
  return created;
}

async function ensureDemoDocument({ studentId, relatedEntityType, relatedEntityId, fileName, reviewStatus = 'pending', reviewComment = null, reviewedBy = null }) {
  const existing = unwrap(await supabase.from('documents').select('*')
    .eq('student_id', studentId).eq('related_entity_type', relatedEntityType)
    .eq('related_entity_id', relatedEntityId).eq('file_name', fileName).maybeSingle());
  if (existing) return existing;
  const { filePath } = await saveFile({
    studentId,
    originalName: fileName,
    buffer: Buffer.from(`Demo report for ${fileName}. This file was created by the internship portal demo seed.`, 'utf8'),
  });
  const [created] = unwrap(await supabase.from('documents').insert({
    student_id: studentId,
    related_entity_type: relatedEntityType,
    related_entity_id: relatedEntityId,
    file_path: filePath,
    file_name: fileName,
    review_status: reviewStatus,
    review_comment: reviewComment,
    reviewed_by: reviewedBy,
    reviewed_at: reviewedBy ? new Date().toISOString() : null,
  }).select());
  return created;
}

async function main() {
  const engineering = await upsertOne('schools', { name: 'School of Engineering & Applied Sciences', code: 'SEAS' }, 'code');
  const sciences = await upsertOne('schools', { name: 'School of Sciences', code: 'SOS' }, 'code');
  const management = await upsertOne('schools', { name: 'School of Management', code: 'SOM' }, 'code');
  const cse = await upsertOne('departments', { school_id: engineering.id, name: 'Computer Science & Engineering', code: 'CSE' }, 'code');
  const ece = await upsertOne('departments', { school_id: engineering.id, name: 'Electronics & Communication Engineering', code: 'ECE' }, 'code');
  const physics = await upsertOne('departments', { school_id: sciences.id, name: 'Physics', code: 'PHY' }, 'code');
  const mba = await upsertOne('departments', { school_id: management.id, name: 'Business Administration', code: 'MBA' }, 'code');

  const admin = await ensureUser({ email: 'crcs.admin@example.edu', full_name: 'CRCS Administrator', roles: [{ role: 'crcs_superadmin' }] });
  const crcsCoordinator = await ensureUser({ email: 'crcs.coordinator@example.edu', full_name: 'Casey CRCS Coordinator', roles: [{ role: 'crcs_coordinator' }] });
  const cseResearch = await ensureUser({ email: 'faculty@example.edu', full_name: 'Dr. Faye Culty', mentorship_scope: 'research', roles: [{ role: 'faculty', department_id: cse.id }] });
  const cseDirect = await ensureUser({ email: 'industry.mentor@example.edu', full_name: 'Indira Industry Mentor', mentorship_scope: 'crcs_self', roles: [{ role: 'faculty', department_id: cse.id }] });
  const cseCoordinator = await ensureUser({ email: 'coordinator@example.edu', full_name: 'Cory Coordinator', mentorship_scope: 'research', roles: [{ role: 'faculty', department_id: cse.id }, { role: 'faculty_coordinator', department_id: cse.id }] });
  const eceResearch = await ensureUser({ email: 'ece.research@example.edu', full_name: 'Dr. Elan Research', mentorship_scope: 'research', roles: [{ role: 'faculty', department_id: ece.id }] });
  const eceDirect = await ensureUser({ email: 'ece.mentor@example.edu', full_name: 'Mira Industry Mentor', mentorship_scope: 'crcs_self', roles: [{ role: 'faculty', department_id: ece.id }] });
  const physicsResearch = await ensureUser({ email: 'physics.research@example.edu', full_name: 'Dr. Priya Research', mentorship_scope: 'research', roles: [{ role: 'faculty', department_id: physics.id }] });
  const mbaDirect = await ensureUser({ email: 'mba.mentor@example.edu', full_name: 'Manish Industry Mentor', mentorship_scope: 'crcs_self', roles: [{ role: 'faculty', department_id: mba.id }] });
  await ensureUser({ email: 'hod@example.edu', full_name: 'Helen HOD', roles: [{ role: 'hod', department_id: cse.id }] });
  await ensureUser({ email: 'ece.hod@example.edu', full_name: 'Eshan HOD', roles: [{ role: 'hod', department_id: ece.id }] });
  await ensureUser({ email: 'physics.hod@example.edu', full_name: 'Pia HOD', roles: [{ role: 'hod', department_id: physics.id }] });
  await ensureUser({ email: 'mba.hod@example.edu', full_name: 'Mohan HOD', roles: [{ role: 'hod', department_id: mba.id }] });
  await ensureUser({ email: 'dean@example.edu', full_name: 'Dana Dean', roles: [{ role: 'dean', school_id: engineering.id }] });
  await ensureUser({ email: 'science.dean@example.edu', full_name: 'Sonia Dean', roles: [{ role: 'dean', school_id: sciences.id }] });
  await ensureUser({ email: 'management.dean@example.edu', full_name: 'Meera Dean', roles: [{ role: 'dean', school_id: management.id }] });
  await ensureUser({ email: 'school.office@example.edu', full_name: 'Sasha School Office', roles: [{ role: 'school_office', school_id: engineering.id }] });
  await ensureUser({ email: 'science.office@example.edu', full_name: 'Sahil School Office', roles: [{ role: 'school_office', school_id: sciences.id }] });
  await ensureUser({ email: 'management.office@example.edu', full_name: 'Maya School Office', roles: [{ role: 'school_office', school_id: management.id }] });
  const sam = await ensureUser({ email: 'student@example.edu', full_name: 'Sam Student', roll_number: 'CSE2026001', batch_year: 2026, roles: [{ role: 'student', department_id: cse.id }] });
  const eceStudent = await ensureUser({ email: 'ece.student@example.edu', full_name: 'Esha Student', roll_number: 'ECE2026001', batch_year: 2026, roles: [{ role: 'student', department_id: ece.id }] });
  const physicsStudent = await ensureUser({ email: 'physics.student@example.edu', full_name: 'Pavan Student', roll_number: 'PHY2026001', batch_year: 2026, roles: [{ role: 'student', department_id: physics.id }] });
  const mbaStudent = await ensureUser({ email: 'mba.student@example.edu', full_name: 'Mina Student', roll_number: 'MBA2026001', batch_year: 2026, roles: [{ role: 'student', department_id: mba.id }] });
  const arjun = await ensureUser({ email: 'arjun.cse@example.edu', full_name: 'Arjun Rao', phone: '9876543210', roll_number: 'CSE2026012', batch_year: 2026, roles: [{ role: 'student', department_id: cse.id }] });
  const nisha = await ensureUser({ email: 'nisha.cse@example.edu', full_name: 'Nisha Patel', phone: '9876543211', roll_number: 'CSE2026017', batch_year: 2026, roles: [{ role: 'student', department_id: cse.id }] });
  await supabase.from('students').update({ cgpa: 8.42 }).eq('id', arjun.id);
  await supabase.from('students').update({ cgpa: 8.16 }).eq('id', nisha.id);

  for (const faculty of [cseResearch, cseDirect, cseCoordinator, eceResearch, eceDirect, physicsResearch, mbaDirect]) {
    // Existing demo accounts may predate mentorship_scope; preserve their account and make the seeded category explicit.
    const scope = [cseDirect.id, eceDirect.id, mbaDirect.id].includes(faculty.id) ? 'crcs_self' : 'research';
    await supabase.from('faculty').update({ mentorship_scope: scope }).eq('id', faculty.id);
  }
  for (const faculty of [cseResearch, cseDirect, cseCoordinator]) {
    await supabase.from('faculty_coordinator_assignments').upsert({ coordinator_id: cseCoordinator.id, faculty_id: faculty.id, department_id: cse.id }, { onConflict: 'coordinator_id,faculty_id' });
  }
  for (const permission_key of ['view_research_approvals', 'view_opportunities']) {
    await supabase.from('crcs_coordinator_permissions').upsert({ coordinator_id: crcsCoordinator.id, permission_key, granted: true, granted_by: admin.id }, { onConflict: 'coordinator_id,permission_key' });
  }

  let cycle = unwrap(await supabase.from('internship_cycles').select('*').eq('status', 'open').order('created_at', { ascending: false }).limit(1).maybeSingle());
  if (!cycle) {
    const [created] = unwrap(await supabase.from('internship_cycles').insert({ name: '2026–27 Internship Cycle', preference_window_opens_at: new Date().toISOString(), preference_window_closes_at: new Date(Date.now() + 60 * DAY).toISOString(), status: 'open', created_by: admin.id }).select());
    cycle = created;
  }
  for (const template of [{ name: 'Weekly Report', track: null }, { name: 'Synopsis Report', track: null }, { name: 'Final Report', track: null }]) {
    const exists = unwrap(await supabase.from('report_templates').select('id').eq('name', template.name).maybeSingle());
    if (!exists) unwrap(await supabase.from('report_templates').insert({ ...template, is_default: true, created_by: admin.id }));
  }
  const researchProject = await ensureBy('research_projects', { faculty_id: cseResearch.id, title: 'Applied AI for Student Support' }, { faculty_id: cseResearch.id, cycle_id: cycle.id, title: 'Applied AI for Student Support', description: 'Research internship for AI-assisted student services.', max_students: 4 });
  await ensureBy('research_projects', { faculty_id: eceResearch.id, title: 'Smart Sensor Networks' }, { faculty_id: eceResearch.id, cycle_id: cycle.id, title: 'Smart Sensor Networks', description: 'Research internship for embedded sensing and analysis.', max_students: 4 });
  await ensureBy('research_projects', { faculty_id: physicsResearch.id, title: 'Computational Materials Lab' }, { faculty_id: physicsResearch.id, cycle_id: cycle.id, title: 'Computational Materials Lab', description: 'Research internship for physics modelling workflows.', max_students: 4 });
  const aiOpportunity = await ensureBy('crcs_opportunities', { cycle_id: cycle.id, title: 'Applied AI Research Intern' }, { cycle_id: cycle.id, title: 'Applied AI Research Intern', organization_name: 'Innovation Lab', description: 'Work on practical AI systems with a university mentor.', eligibility: 'CSE students, 7.0 CGPA or above', application_deadline: new Date(Date.now() + 30 * DAY).toISOString(), posted_by: admin.id });
  const electronicsOpportunity = await ensureBy('crcs_opportunities', { cycle_id: cycle.id, title: 'Embedded Systems Intern' }, { cycle_id: cycle.id, title: 'Embedded Systems Intern', organization_name: 'CircuitWorks', description: 'Prototype and test embedded systems with an industry team.', eligibility: 'ECE students, 6.5 CGPA or above', application_deadline: new Date(Date.now() + 35 * DAY).toISOString(), posted_by: admin.id });

  await ensureBy('student_track_selections', { student_id: sam.id, cycle_id: cycle.id }, { student_id: sam.id, cycle_id: cycle.id, track: 'research' });
  await ensureBy('student_track_selections', { student_id: eceStudent.id, cycle_id: cycle.id }, { student_id: eceStudent.id, cycle_id: cycle.id, track: 'crcs_opportunity' });
  await ensureBy('student_track_selections', { student_id: physicsStudent.id, cycle_id: cycle.id }, { student_id: physicsStudent.id, cycle_id: cycle.id, track: 'self_internship' });
  await ensureBy('student_track_selections', { student_id: mbaStudent.id, cycle_id: cycle.id }, { student_id: mbaStudent.id, cycle_id: cycle.id, track: 'self_internship' });
  await ensureBy('student_track_selections', { student_id: arjun.id, cycle_id: cycle.id }, { student_id: arjun.id, cycle_id: cycle.id, track: 'crcs_opportunity' });
  await ensureBy('student_track_selections', { student_id: nisha.id, cycle_id: cycle.id }, { student_id: nisha.id, cycle_id: cycle.id, track: 'self_internship' });
  await ensureBy('research_applications', { student_id: sam.id, project_id: researchProject.id }, { student_id: sam.id, project_id: researchProject.id, status: 'pending_faculty' });
  await ensureBy('opportunity_applications', { student_id: eceStudent.id, opportunity_id: electronicsOpportunity.id }, { student_id: eceStudent.id, opportunity_id: electronicsOpportunity.id, status: 'applied' });
  await ensureBy('opportunity_applications', { student_id: mbaStudent.id, opportunity_id: aiOpportunity.id }, { student_id: mbaStudent.id, opportunity_id: aiOpportunity.id, status: 'crcs_approved', assigned_mentor_id: mbaDirect.id, mentor_assigned_by: admin.id, mentor_assigned_at: new Date().toISOString() });
  const arjunOpportunity = await ensureBy('opportunity_applications', { student_id: arjun.id, opportunity_id: aiOpportunity.id }, { student_id: arjun.id, opportunity_id: aiOpportunity.id, status: 'crcs_approved', assigned_mentor_id: cseDirect.id, mentor_assigned_by: admin.id, mentor_assigned_at: new Date().toISOString() });
  await ensureDemoDocument({ studentId: arjun.id, relatedEntityType: 'opportunity_application', relatedEntityId: arjunOpportunity.id, fileName: 'arjun-weekly-report-1.txt' });
  await supabase.from('marks').upsert({ student_id: arjun.id, cycle_id: cycle.id, weekly_report_score: 18, mid_marks: 24, synopsis_marks: 17, entered_by: cseDirect.id, updated_at: new Date().toISOString() }, { onConflict: 'student_id,cycle_id' });

  console.log('[seed] Complete demo environment is ready.');
  console.log(`[seed] Active cycle: ${cycle.name} (${cycle.id})`);
  console.log('[seed] Password for every demo account: Passw0rd!');
  console.log('[seed] Schools: SEAS, SOS, SOM. Departments: CSE, ECE, PHY, MBA.');
  console.log('[seed] Industry mentor demo: industry.mentor@example.edu is available for CRCS/self-internship allocations.');
  console.log('[seed] Key accounts: crcs.admin@example.edu, faculty@example.edu, industry.mentor@example.edu, ece.mentor@example.edu, student@example.edu, ece.student@example.edu, physics.student@example.edu, mba.student@example.edu.');
}

main().catch((error) => { console.error('[seed] failed:', error.message); process.exit(1); });
