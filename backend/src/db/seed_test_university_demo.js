import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { supabase, unwrap } from './client.js';
import { createPortalUser } from '../lib/users.js';
import { saveFile } from '../lib/storage.js';

// This seed is deliberately tenant-scoped. It never writes to SRM AP or any
// university other than the designated TESTU demo tenant.
const UNIVERSITY_CODE = 'TESTU';
const EMAIL_SUFFIX = '@demo.vextra.test';
const DAY = 24 * 60 * 60 * 1000;
const seedPassword = process.env.DEMO_SEED_PASSWORD || `${randomBytes(24).toString('base64url')}Aa1!`;

async function ensureBy(table, filters, row) {
  let query = supabase.from(table).select('*');
  for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
  const existing = unwrap(await query.maybeSingle());
  if (existing) return existing;
  const [created] = unwrap(await supabase.from(table).insert(row).select());
  return created;
}

async function ensureSchool(universityId, name, code) {
  const existing = unwrap(await supabase.from('schools').select('*').eq('university_id', universityId).eq('code', code).maybeSingle());
  if (existing) return existing;
  const [created] = unwrap(await supabase.from('schools').insert({ university_id: universityId, name, code }).select());
  return created;
}

async function ensureDepartment(school, name, code) {
  return ensureBy('departments', { school_id: school.id, code }, { school_id: school.id, name, code });
}

async function ensureDemoUser(data) {
  const existing = unwrap(await supabase.from('users').select('id').eq('email', data.email).maybeSingle());
  if (existing) {
    unwrap(await supabase.from('users').update({ full_name: data.full_name, phone: data.phone ?? null, is_active: true, last_login_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', existing.id));
    return { id: existing.id };
  }
  const user = await createPortalUser({ ...data, password: seedPassword });
  unwrap(await supabase.from('users').update({ last_login_at: new Date().toISOString() }).eq('id', user.id));
  return user;
}

async function ensureDocument({ studentId, relatedEntityType, relatedEntityId, fileName, reviewedBy = null }) {
  const existing = unwrap(await supabase.from('documents').select('id')
    .eq('student_id', studentId)
    .eq('related_entity_type', relatedEntityType)
    .eq('related_entity_id', relatedEntityId)
    .eq('file_name', fileName)
    .maybeSingle());
  if (existing) return existing;
  const { filePath } = await saveFile({
    studentId,
    originalName: fileName,
    buffer: Buffer.from(`TESTU demo document: ${fileName}\nGenerated data for walkthroughs only.`, 'utf8'),
  });
  const [created] = unwrap(await supabase.from('documents').insert({
    student_id: studentId,
    related_entity_type: relatedEntityType,
    related_entity_id: relatedEntityId,
    file_path: filePath,
    file_name: fileName,
    review_status: reviewedBy ? 'verified' : 'pending',
    reviewed_by: reviewedBy,
    reviewed_at: reviewedBy ? new Date().toISOString() : null,
  }).select());
  return created;
}

function demoEmail(localPart) {
  return `${localPart}${EMAIL_SUFFIX}`;
}

async function main() {
  const workflowStartedAt = Date.now();
  const university = unwrap(await supabase.from('universities').select('id,name,code,is_active').eq('code', UNIVERSITY_CODE).maybeSingle());
  if (!university) throw new Error(`Demo university ${UNIVERSITY_CODE} does not exist. Create it from Vextra first.`);
  if (!university.is_active) unwrap(await supabase.from('universities').update({ is_active: true }).eq('id', university.id));

  const engineering = await ensureSchool(university.id, 'Test University School of Engineering', 'TENG');
  const management = await ensureSchool(university.id, 'Test University School of Business & Sciences', 'TBUS');
  const cse = await ensureDepartment(engineering, 'Computer Science and Engineering', 'CSE');
  const ece = await ensureDepartment(engineering, 'Electronics and Communication Engineering', 'ECE');
  const mechanical = await ensureDepartment(engineering, 'Mechanical Engineering', 'ME');
  const mba = await ensureDepartment(management, 'Business Administration', 'MBA');
  const departments = [cse, ece, mechanical, mba];

  const superadmin = await ensureDemoUser({
    email: demoEmail('superadmin'), full_name: 'Demo CRCS Superadmin',
    roles: [{ role: 'crcs_superadmin' }], university_id: university.id,
  });
  const coordinator = await ensureDemoUser({
    email: demoEmail('coordinator'), full_name: 'Demo CRCS Coordinator',
    roles: [{ role: 'crcs_coordinator' }], university_id: university.id,
  });
  const deanEngineering = await ensureDemoUser({
    email: demoEmail('dean.engineering'), full_name: 'Dr. Aditi Raman',
    roles: [{ role: 'dean', school_id: engineering.id }], university_id: university.id,
  });
  const deanBusiness = await ensureDemoUser({
    email: demoEmail('dean.business'), full_name: 'Dr. Vikram Shah',
    roles: [{ role: 'dean', school_id: management.id }], university_id: university.id,
  });
  const officeEngineering = await ensureDemoUser({
    email: demoEmail('office.engineering'), full_name: 'Nisha Operations',
    roles: [{ role: 'school_office', school_id: engineering.id }], university_id: university.id,
  });
  const officeBusiness = await ensureDemoUser({
    email: demoEmail('office.business'), full_name: 'Rajesh Office',
    roles: [{ role: 'school_office', school_id: management.id }], university_id: university.id,
  });

  const hods = await Promise.all(departments.map((department) => ensureDemoUser({
    email: demoEmail(`hod.${department.code.toLowerCase()}`), full_name: `Demo ${department.code} HOD`,
    roles: [{ role: 'hod', department_id: department.id }], university_id: university.id,
  })));
  const facultyCoordinator = await ensureDemoUser({
    email: demoEmail('faculty.coordinator'), full_name: 'Dr. Meera Coordinator', mentorship_scope: 'research',
    roles: [{ role: 'faculty', department_id: cse.id }, { role: 'faculty_coordinator', department_id: cse.id }], university_id: university.id,
  });
  const faculty = [];
  for (const department of departments) {
    for (let index = 1; index <= 3; index += 1) {
      faculty.push(await ensureDemoUser({
        email: demoEmail(`faculty.${department.code.toLowerCase()}.${index}`),
        full_name: `Dr. ${department.code} Faculty ${index}`,
        cabin: `${department.code}-${100 + index}`,
        mentorship_scope: index === 3 ? 'crcs_self' : 'research',
        roles: [{ role: 'faculty', department_id: department.id }], university_id: university.id,
      }));
    }
  }

  unwrap(await supabase.from('crcs_coordinator_permissions').upsert([
    { coordinator_id: coordinator.id, permission_key: 'view_research_approvals', granted: true, granted_by: superadmin.id },
    { coordinator_id: coordinator.id, permission_key: 'view_opportunities', granted: true, granted_by: superadmin.id },
    { coordinator_id: coordinator.id, permission_key: 'view_self_internships', granted: true, granted_by: superadmin.id },
  ], { onConflict: 'coordinator_id,permission_key' }));
  for (const facultyMember of faculty.filter((_, index) => index < 3)) {
    unwrap(await supabase.from('faculty_coordinator_assignments').upsert({
      coordinator_id: facultyCoordinator.id, faculty_id: facultyMember.id, department_id: cse.id,
    }, { onConflict: 'coordinator_id,faculty_id' }));
  }

  let cycle = await ensureBy('internship_cycles', { university_id: university.id, name: 'TESTU · Internship Demo Cycle 2026' }, {
    university_id: university.id,
    name: 'TESTU · Internship Demo Cycle 2026',
    batch_label: 'Demo cohort · 2026',
    guidelines: 'Demo-only internship workflow covering research, CRCS opportunities, self internships, mentor allocation, attendance, reports, and marks.',
    preference_window_opens_at: new Date(Date.now() - 14 * DAY).toISOString(),
    preference_window_closes_at: new Date(Date.now() + 70 * DAY).toISOString(),
    status: 'open', total_weeks: 16, created_by: superadmin.id,
  });
  if (cycle.status !== 'open') {
    [cycle] = unwrap(await supabase.from('internship_cycles').update({ status: 'open', preference_changes_locked: false }).eq('id', cycle.id).select());
  }

  const researchFaculty = faculty.filter((_, index) => index % 3 !== 2);
  const selfMentors = faculty.filter((_, index) => index % 3 === 2);
  const projects = await Promise.all(researchFaculty.slice(0, 6).map((mentor, index) => ensureBy('research_projects', {
    faculty_id: mentor.id, cycle_id: cycle.id, title: `Demo Research Project ${index + 1}`,
  }, {
    faculty_id: mentor.id, cycle_id: cycle.id, title: `Demo Research Project ${index + 1}`,
    description: `Applied ${['AI', 'embedded systems', 'analytics', 'sustainability', 'product research', 'automation'][index]} project for the Test University demo cohort.`,
    max_students: 4, status: 'open',
  })));
  const opportunities = await Promise.all([
    ['Data Analyst Intern', 'Test University Analytics Lab', cse.id, 7.0, 'exclusive'],
    ['Embedded Systems Intern', 'Demo Circuit Works', ece.id, 6.5, 'exclusive'],
    ['Operations Intern', 'Demo Growth Studio', mba.id, 6.0, 'open_source'],
    ['Product Research Intern', 'Demo Innovation Hub', mechanical.id, 6.5, 'open_source'],
  ].map(([title, organization_name, departmentId, minimum_cgpa, opportunity_type]) => ensureBy('crcs_opportunities', { cycle_id: cycle.id, title }, {
    cycle_id: cycle.id, title, organization_name,
    description: `${title} opportunity available only in the TESTU demonstration tenant.`,
    eligibility: 'Demo cohort students meeting the displayed CGPA threshold.',
    eligible_department_ids: [departmentId], minimum_cgpa,
    application_deadline: new Date(Date.now() + 30 * DAY).toISOString(), opportunity_type,
    posted_by: superadmin.id, is_active: true,
  })));

  const students = [];
  for (let index = 1; index <= 60; index += 1) {
    const department = departments[(index - 1) % departments.length];
    const student = await ensureDemoUser({
      email: demoEmail(`student.${String(index).padStart(3, '0')}`),
      full_name: `Demo ${department.code} Student ${String(index).padStart(3, '0')}`,
      phone: `90000${String(index).padStart(5, '0')}`,
      roll_number: `TESTU${department.code}26${String(index).padStart(3, '0')}`,
      batch_year: 2026, cgpa: Number((6.25 + ((index * 37) % 360) / 100).toFixed(2)),
      roles: [{ role: 'student', department_id: department.id }], university_id: university.id,
    });
    students.push({ ...student, department, index });
  }

  const organisationParticipants = [
    { user: superadmin, type: 'crcs_superadmin' }, { user: coordinator, type: 'crcs_coordinator' },
    { user: deanEngineering, type: 'dean', school: engineering }, { user: deanBusiness, type: 'dean', school: management },
    { user: officeEngineering, type: 'school_office', school: engineering }, { user: officeBusiness, type: 'school_office', school: management },
    ...hods.map((user, index) => ({ user, type: 'hod', department: departments[index] })),
    { user: facultyCoordinator, type: 'faculty_coordinator', department: cse },
    ...faculty.map((user, index) => ({ user, type: 'faculty', department: departments[Math.floor(index / 3)] })),
  ];
  const participantRows = [
    ...students.map(({ id, department }) => ({ cycle_id: cycle.id, user_id: id, participant_type: 'student', category: `${department.code} · 2026`, department_id: department.id, school_id: department.school_id, source: 'bulk_import', enrolled_by: superadmin.id })),
    ...organisationParticipants.map(({ user, type, department, school }) => ({ cycle_id: cycle.id, user_id: user.id, participant_type: type, department_id: department?.id ?? null, school_id: school?.id ?? department?.school_id ?? null, source: 'existing', enrolled_by: superadmin.id })),
  ];
  unwrap(await supabase.from('cycle_participants').upsert(participantRows, { onConflict: 'cycle_id,user_id' }));

  const researchStatuses = ['pending_faculty', 'faculty_approved', 'pending_crcs_approval', 'crcs_approved', 'rejected'];
  const opportunityStatuses = ['applied', 'under_review', 'offered', 'crcs_approved', 'rejected'];
  const selfStatuses = ['submitted', 'mentor_approved', 'crcs_approved', 'rejected', 'active', 'completed'];
  const documented = [];
  for (const student of students) {
    const group = (student.index - 1) % 3;
    if (group === 0) {
      const project = projects[(student.index - 1) % projects.length];
      const status = researchStatuses[(student.index - 1) % researchStatuses.length];
      const application = await ensureBy('research_applications', { student_id: student.id, project_id: project.id }, {
        student_id: student.id, project_id: project.id, status,
        faculty_decision_by: status === 'pending_faculty' ? null : project.faculty_id,
        faculty_decision_at: status === 'pending_faculty' ? null : new Date(workflowStartedAt - (7 + (student.index % 3)) * DAY).toISOString(),
        crcs_decision_by: status === 'crcs_approved' ? superadmin.id : null,
        crcs_decision_at: status === 'crcs_approved' ? new Date(workflowStartedAt - 3 * DAY).toISOString() : null,
        rejection_reason: status === 'rejected' ? 'Demo application kept as a rejection-state example.' : null,
        rejected_by_role: status === 'rejected' ? 'faculty' : null,
        rejected_at_stage: status === 'rejected' ? 'faculty' : null,
        created_at: new Date(workflowStartedAt - (15 + (student.index % 4)) * DAY).toISOString(),
      });
      await ensureBy('student_track_selections', { student_id: student.id, cycle_id: cycle.id, track: 'research' }, { student_id: student.id, cycle_id: cycle.id, track: 'research' });
      if (status === 'crcs_approved') {
        await ensureBy('mentor_assignments', { research_application_id: application.id }, {
          student_id: student.id, research_application_id: application.id, faculty_id: project.faculty_id, is_current: true,
        });
        documented.push({ studentId: student.id, type: 'research_application', id: application.id, reviewer: project.faculty_id });
      }
    } else if (group === 1) {
      const opportunity = opportunities[(student.index - 1) % opportunities.length];
      const status = opportunityStatuses[(student.index - 1) % opportunityStatuses.length];
      const mentor = selfMentors[(student.index - 1) % selfMentors.length];
      const application = await ensureBy('opportunity_applications', { student_id: student.id, opportunity_id: opportunity.id }, {
        student_id: student.id, opportunity_id: opportunity.id, status,
        decision_by: ['offered', 'crcs_approved', 'rejected'].includes(status) ? superadmin.id : null,
        decision_at: ['offered', 'crcs_approved', 'rejected'].includes(status) ? new Date(Date.now() - 4 * DAY).toISOString() : null,
        assigned_mentor_id: status === 'crcs_approved' ? mentor.id : null,
        mentor_assigned_by: status === 'crcs_approved' ? superadmin.id : null,
        mentor_assigned_at: status === 'crcs_approved' ? new Date(Date.now() - 3 * DAY).toISOString() : null,
        rejection_reason: status === 'rejected' ? 'Demo application kept as a rejection-state example.' : null,
      });
      await ensureBy('student_track_selections', { student_id: student.id, cycle_id: cycle.id, track: 'crcs_opportunity' }, { student_id: student.id, cycle_id: cycle.id, track: 'crcs_opportunity' });
      if (status === 'crcs_approved') {
        unwrap(await supabase.from('opportunity_applications').update({ assigned_mentor_id: mentor.id, mentor_assigned_by: superadmin.id, mentor_assigned_at: new Date(Date.now() - 3 * DAY).toISOString() }).eq('id', application.id));
        documented.push({ studentId: student.id, type: 'opportunity_application', id: application.id, reviewer: mentor.id });
      }
    } else {
      const status = selfStatuses[(student.index - 1) % selfStatuses.length];
      const mentor = selfMentors[(student.index - 1) % selfMentors.length];
      const internship = await ensureBy('self_internships', { student_id: student.id, cycle_id: cycle.id, company_name: `Demo Company ${student.index}` }, {
        student_id: student.id, cycle_id: cycle.id, company_name: `Demo Company ${student.index}`,
        company_website: 'https://example.edu/demo-company', company_address: 'Demo City, India', offer_source: 'Campus demonstration', status,
        assigned_mentor_id: status === 'submitted' ? null : mentor.id,
        mentor_decision_by: ['mentor_approved', 'crcs_approved', 'active', 'completed'].includes(status) ? mentor.id : null,
        mentor_decision_at: ['mentor_approved', 'crcs_approved', 'active', 'completed'].includes(status) ? new Date(Date.now() - 6 * DAY).toISOString() : null,
        crcs_decision_by: ['crcs_approved', 'active', 'completed'].includes(status) ? superadmin.id : null,
        crcs_decision_at: ['crcs_approved', 'active', 'completed'].includes(status) ? new Date(Date.now() - 4 * DAY).toISOString() : null,
        rejection_reason: status === 'rejected' ? 'Demo internship kept as a rejection-state example.' : null,
      });
      await ensureBy('student_track_selections', { student_id: student.id, cycle_id: cycle.id, track: 'self_internship' }, { student_id: student.id, cycle_id: cycle.id, track: 'self_internship' });
      if (['crcs_approved', 'active', 'completed'].includes(status)) {
        for (let week = 1; week <= 3; week += 1) {
          await ensureBy('weekly_attendance', { student_id: student.id, related_entity_type: 'self_internship', related_entity_id: internship.id, week_number: week }, {
            student_id: student.id, faculty_id: mentor.id, related_entity_type: 'self_internship', related_entity_id: internship.id,
            week_number: week, present: week !== 2 || student.index % 2 === 0, marked_by: mentor.id,
          });
        }
        documented.push({ studentId: student.id, type: 'self_internship', id: internship.id, reviewer: mentor.id });
      }
    }
    unwrap(await supabase.from('marks').upsert({
      student_id: student.id, cycle_id: cycle.id,
      weekly_report_score: 14 + (student.index % 7), mid_marks: 18 + (student.index % 8), synopsis_marks: 12 + (student.index % 6),
      thesis_marks: 20 + (student.index % 10), ppt_marks: 8 + (student.index % 3), viva_marks: 8 + (student.index % 3),
      entered_by: superadmin.id, updated_at: new Date().toISOString(),
    }, { onConflict: 'student_id,cycle_id' }));
  }

  // Keep a repeat run valid if a previous seed run created rejection examples
  // before the workflow metadata fields were added here.
  unwrap(await supabase.from('research_applications').update({
    rejected_by_role: 'faculty', rejected_at_stage: 'faculty', rejection_reason: 'Demo application kept as a rejection-state example.',
  }).eq('status', 'rejected').in('student_id', students.map((student) => student.id)));
  unwrap(await supabase.from('research_applications').update({ created_at: new Date(workflowStartedAt - 15 * DAY).toISOString() })
    .in('student_id', students.map((student) => student.id)));
  unwrap(await supabase.from('research_applications').update({ faculty_decision_at: new Date(workflowStartedAt - 7 * DAY).toISOString() })
    .in('student_id', students.map((student) => student.id)).in('status', ['faculty_approved', 'pending_crcs_approval', 'crcs_approved', 'rejected']));
  unwrap(await supabase.from('research_applications').update({ crcs_decision_at: new Date(workflowStartedAt - 3 * DAY).toISOString() })
    .in('student_id', students.map((student) => student.id)).eq('status', 'crcs_approved'));

  for (const [index, item] of documented.slice(0, 8).entries()) {
    await ensureDocument({
      studentId: item.studentId, relatedEntityType: item.type, relatedEntityId: item.id,
      fileName: `demo-submission-${String(index + 1).padStart(2, '0')}.txt`, reviewedBy: item.reviewer,
    });
  }

  console.log(JSON.stringify({
    university: university.code,
    cycle: cycle.name,
    students: students.length,
    faculty: faculty.length + 1,
    quickLoginAccounts: 8,
    note: 'Seeded only TESTU; all quick-login emails use the demo.vextra.test suffix.',
  }, null, 2));
}

main().catch((error) => {
  console.error('[seed:testu-demo] failed:', error.message);
  process.exit(1);
});
