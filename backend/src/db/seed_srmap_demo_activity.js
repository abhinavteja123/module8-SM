import 'dotenv/config';
import { supabase, unwrap } from './client.js';
import { saveFile } from '../lib/storage.js';

// ponytail: reuses the 273 students / 37 faculty already enrolled by
// seed:srmap-quick-access + the bulk import — no new accounts are created.
// Every insert is guarded by a natural-key existence check, so re-running
// this script is safe and does not duplicate rows.
const UNIVERSITY_CODE = 'SRMAP';
const CYCLE_NAME = '2023-2027';
const TITLE_MARK = 'Demo bulk:';
const WEEKS = [1, 2, 3, 4];
const COMPANIES = [
  { name: 'Zenlytics Software Pvt Ltd', website: 'https://zenlytics.example.com', address: 'Tower B, Cyber Hub, Gurugram', hr: 'Ananya Rao', source: 'Campus placement drive' },
  { name: 'Northbridge Analytics', website: 'https://northbridge.example.com', address: '4th Floor, Salarpuria Tech Park, Bengaluru', hr: 'Vikram Nair', source: 'LinkedIn outreach' },
  { name: 'Cobalt Cloud Systems', website: 'https://cobaltcloud.example.com', address: 'DLF Cyber City, Chennai', hr: 'Sneha Iyer', source: 'Referral from alumnus' },
  { name: 'Ferrovia Robotics', website: 'https://ferrovia.example.com', address: 'Hitech City, Hyderabad', hr: 'Rahul Menon', source: 'Company career portal' },
  { name: 'Solstice Fintech Labs', website: 'https://solsticefintech.example.com', address: 'BKC, Mumbai', hr: 'Divya Krishnan', source: 'Campus placement drive' },
  { name: 'Aurelia Biotech', website: 'https://aureliabio.example.com', address: 'Genome Valley, Hyderabad', hr: 'Karthik Subramaniam', source: 'Faculty recommendation' },
  { name: 'Vantage Point Consulting', website: 'https://vantagepoint.example.com', address: 'Nariman Point, Mumbai', hr: 'Priya Deshmukh', source: 'Job fair' },
  { name: 'Kestrel Aerospace', website: 'https://kestrelaero.example.com', address: 'Whitefield, Bengaluru', hr: 'Arjun Bhat', source: 'Company career portal' },
  { name: 'Lumen Health Systems', website: 'https://lumenhealth.example.com', address: 'Electronic City, Bengaluru', hr: 'Meenal Kapoor', source: 'LinkedIn outreach' },
  { name: 'Ridgeline Energy', website: 'https://ridgelineenergy.example.com', address: 'Sector 62, Noida', hr: 'Aditya Ghosh', source: 'Referral from alumnus' },
  { name: 'Orbital Data Works', website: 'https://orbitaldata.example.com', address: 'Kondapur, Hyderabad', hr: 'Ishaan Chatterjee', source: 'Campus placement drive' },
  { name: 'Meridian Logistics Tech', website: 'https://meridianlogistics.example.com', address: 'Peenya Industrial Area, Bengaluru', hr: 'Ritika Saxena', source: 'Job fair' },
];
function companyFor(i) {
  const c = COMPANIES[i % COMPANIES.length];
  return { company_name: c.name, company_website: c.website, company_address: c.address, hr_name: `${c.hr} (HR)`, hr_contact: `${c.hr.toLowerCase().replace(/\s+/g, '.')}@${new URL(c.website).hostname}`, offer_source: c.source };
}
// Deterministic pseudo-random offset so re-runs converge to the same value
// instead of reshuffling timestamps on every execution.
function hashOffset(id, max) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % max;
}
function pastTimestamp(id, maxDays) {
  return new Date(Date.now() - hashOffset(id, maxDays) * 86400000 - hashOffset(`${id}:h`, 24) * 3600000).toISOString();
}

const stats = {
  projects: 0, researchApps: 0, mentorAssignments: 0, opportunities: 0, opportunityApps: 0,
  selfInternships: 0, documents: 0, scores: 0, attendance: 0, deadlines: 0, trackSelections: 0, errors: [],
};

async function safe(label, fn) {
  try {
    await fn();
  } catch (error) {
    stats.errors.push(`${label}: ${error.message}`);
  }
}

function chunk(array, sizes) {
  let offset = 0;
  return sizes.map((size) => {
    const slice = array.slice(offset, offset + size);
    offset += size;
    return slice;
  });
}

async function main() {
  const university = unwrap(await supabase.from('universities').select('id,is_active').eq('code', UNIVERSITY_CODE).maybeSingle());
  if (!university?.is_active) throw new Error('SRM AP must exist and be active — run npm run seed:srmap-quick-access first.');
  const cycle = unwrap(await supabase.from('internship_cycles').select('id,status').eq('university_id', university.id).eq('name', CYCLE_NAME).maybeSingle());
  if (!cycle || cycle.status !== 'open') throw new Error(`SRM AP cycle ${CYCLE_NAME} must exist and be open.`);
  const admin = unwrap(await supabase.from('users').select('id').eq('email', 'quick.superadmin@demo.srmap.test').maybeSingle());
  if (!admin) throw new Error('Run npm run seed:srmap-quick-access first (quick.superadmin account is required as the actor for seeded rows).');

  // .order() is required here: without it Postgres/PostgREST does not
  // guarantee row order across calls, and this script's whole idempotency
  // model depends on chunk() slicing the SAME students into the SAME bucket
  // every run (an unordered re-fetch silently reshuffles bucket membership
  // and duplicates "new" application rows for students who moved buckets).
  const facultyParticipants = unwrap(await supabase.from('cycle_participants').select('user_id').eq('cycle_id', cycle.id).eq('participant_type', 'faculty').order('user_id'));
  // .order() here too: .in() does not preserve the input list's order, so
  // without it researchFaculty/crcsFaculty (and therefore projects[]) can
  // come back in a different order on every run, silently breaking the
  // "same first 4 students -> same project[0]" idempotency this script
  // depends on (this exact bug produced research_projects with
  // approved_count > max_students after a second run — fixed here, and the
  // live data was repaired separately).
  const facultyDetails = unwrap(await supabase.from('faculty').select('id,department_id,mentorship_scope').in('id', facultyParticipants.map((row) => row.user_id)).order('id'));
  const researchFaculty = facultyDetails.filter((f) => f.mentorship_scope === 'research');
  const crcsFaculty = facultyDetails.filter((f) => f.mentorship_scope === 'crcs_self');
  if (!researchFaculty.length || !crcsFaculty.length) throw new Error('Cycle roster has no research-scope or no crcs_self-scope faculty to seed against.');

  const studentParticipants = unwrap(await supabase.from('cycle_participants').select('user_id').eq('cycle_id', cycle.id).eq('participant_type', 'student').order('user_id'));
  const students = studentParticipants.map((row) => row.user_id);
  if (students.length < 50) throw new Error(`Only ${students.length} students enrolled — expected the ~273-student SRM AP roster.`);

  const templates = unwrap(await supabase.from('report_templates').select('id,name').order('created_at'));
  const weeklyTemplate = templates.find((t) => t.name === 'Weekly Report') ?? templates[0];
  const finalTemplate = templates.find((t) => t.name === 'Final Report') ?? templates[templates.length - 1];

  // --- Research projects: every research faculty gets 1-2 projects; the
  // first faculty is deliberately pushed to max_projects_per_faculty (4) so
  // the new dynamic cap is visible/testable at the ceiling.
  const projects = [];
  // Sort by the faculty's own id (not fetch order) so "index 0 gets 4
  // projects" always refers to the SAME faculty member on every run — array
  // fetch order from Postgres/PostgREST is not guaranteed stable across
  // calls even with .order() upstream once .filter()/.entries() are layered
  // on top, and this is the one place that mattered for idempotency.
  const sortedResearchFaculty = [...researchFaculty].sort((a, b) => a.id.localeCompare(b.id));
  for (const [index, faculty] of sortedResearchFaculty.entries()) {
    const projectCount = index === 0 ? 4 : 1 + (index % 2);
    for (let i = 1; i <= projectCount; i++) {
      const title = `${TITLE_MARK} Research Project ${i} (${faculty.id.slice(0, 8)})`;
      await safe(`project ${title}`, async () => {
        let project = unwrap(await supabase.from('research_projects').select('*').eq('faculty_id', faculty.id).eq('title', title).maybeSingle());
        if (!project) {
          [project] = unwrap(await supabase.from('research_projects').insert({
            faculty_id: faculty.id, cycle_id: cycle.id, title,
            description: 'Seeded demo research project for bulk testing.', max_students: 4,
          }).select());
          stats.projects++;
        }
        projects.push(project);
      });
    }
  }

  // --- CRCS opportunities: spread across type/availability edge cases.
  const opportunitySpecs = [
    { title: `${TITLE_MARK} Applied AI Research Intern`, type: 'exclusive', accepting: true, deadlineDays: 30, active: true },
    { title: `${TITLE_MARK} Embedded Systems Intern`, type: 'exclusive', accepting: true, deadlineDays: 45, active: true },
    { title: `${TITLE_MARK} Cloud Platform Intern`, type: 'exclusive', accepting: true, deadlineDays: 20, active: true },
    { title: `${TITLE_MARK} Data Analytics Intern`, type: 'open_source', accepting: true, deadlineDays: 25, active: true, url: 'https://example-company.test/careers/data-analytics' },
    { title: `${TITLE_MARK} Frontend Engineering Intern`, type: 'open_source', accepting: true, deadlineDays: 40, active: true, url: 'https://example-company.test/careers/frontend' },
    { title: `${TITLE_MARK} Deadline Passed Intern`, type: 'exclusive', accepting: true, deadlineDays: -5, active: true },
    { title: `${TITLE_MARK} Manually Closed Intern`, type: 'exclusive', accepting: false, deadlineDays: 30, active: true },
    { title: `${TITLE_MARK} Archived Intern Role`, type: 'exclusive', accepting: true, deadlineDays: 30, active: false },
  ];
  const opportunities = [];
  for (const spec of opportunitySpecs) {
    await safe(`opportunity ${spec.title}`, async () => {
      let opportunity = unwrap(await supabase.from('crcs_opportunities').select('*').eq('cycle_id', cycle.id).eq('title', spec.title).maybeSingle());
      if (!opportunity) {
        [opportunity] = unwrap(await supabase.from('crcs_opportunities').insert({
          cycle_id: cycle.id, title: spec.title, organization_name: 'Demo Bulk Corp', description: 'Seeded demo opportunity for bulk testing.',
          eligibility: 'Open to all departments', application_deadline: new Date(Date.now() + spec.deadlineDays * 86400000).toISOString(),
          posted_by: admin.id, opportunity_type: spec.type, accepting_applications: spec.accepting, is_active: spec.active,
          application_url: spec.url ?? null,
        }).select());
        stats.opportunities++;
      }
      opportunities.push(opportunity);
    });
  }
  const activeOpportunities = opportunities.filter((o) => o.is_active !== false);

  // --- Partition the roster so exclusivity (one approved track per student)
  // is respected exactly like the app would enforce it on real approvals.
  const [approvedResearch, approvedOpportunity, activeSelf, pendingMixed, rejectedEverywhere] = chunk(students, [90, 70, 40, 50, students.length - 250]);

  let crcsMentorLoad = new Map(crcsFaculty.map((f) => [f.id, 0]));
  function nextCrcsMentor(cap) {
    const maxedFaculty = crcsFaculty[0];
    if ((crcsMentorLoad.get(maxedFaculty.id) ?? 0) < cap) return maxedFaculty; // deliberately fill this one to the cap first
    const candidate = [...crcsMentorLoad.entries()].sort((a, b) => a[1] - b[1])[0];
    return crcsFaculty.find((f) => f.id === candidate[0]);
  }
  function assignMentor(facultyId) { crcsMentorLoad.set(facultyId, (crcsMentorLoad.get(facultyId) ?? 0) + 1); }

  const documentTargets = []; // { studentId, relatedEntityType, relatedEntityId, mentorId }

  // --- Research applications: approvedResearch bucket gets one crcs_approved
  // application each, cycling through projects; project[0] is driven to
  // exactly max_students (4) to exercise the "project full" edge case.
  let projectCursor = 0;
  for (const [i, studentId] of approvedResearch.entries()) {
    const targetProject = i < 4 ? projects[0] : projects[1 + (projectCursor++ % (projects.length - 1))];
    await safe(`research application ${studentId}`, async () => {
      let application = unwrap(await supabase.from('research_applications').select('*').eq('student_id', studentId).eq('project_id', targetProject.id).maybeSingle());
      if (!application) {
        // Hard cap, independent of any upstream ordering assumption: never
        // approve past a project's own max_students, mirroring the real
        // POST /applications/:id/crcs-decision guard in research.js.
        const fresh = unwrap(await supabase.from('research_projects').select('approved_count,max_students').eq('id', targetProject.id).maybeSingle());
        if (fresh.approved_count >= fresh.max_students) return;
        const now = new Date().toISOString();
        [application] = unwrap(await supabase.from('research_applications').insert({
          student_id: studentId, project_id: targetProject.id, status: 'crcs_approved',
          faculty_decision_by: targetProject.faculty_id, faculty_decision_at: now, crcs_decision_by: admin.id, crcs_decision_at: now,
        }).select());
        stats.researchApps++;
        const count = fresh.approved_count + 1;
        unwrap(await supabase.from('research_projects').update({
          approved_count: count, status: count >= fresh.max_students ? 'full' : 'locked', locked_at: now, updated_at: now,
        }).eq('id', targetProject.id));
      }
      const existingAssignment = unwrap(await supabase.from('mentor_assignments').select('id').eq('research_application_id', application.id).maybeSingle());
      if (!existingAssignment) {
        unwrap(await supabase.from('mentor_assignments').insert({ student_id: studentId, research_application_id: application.id, faculty_id: targetProject.faculty_id, is_current: true, reassigned_by: admin.id }));
        stats.mentorAssignments++;
      }
      documentTargets.push({ studentId, relatedEntityType: 'research_application', relatedEntityId: application.id, mentorId: targetProject.faculty_id });
    });
  }

  // --- CRCS opportunity applications: approvedOpportunity bucket gets one
  // crcs_approved application each; mentor allocation deliberately maxes
  // crcsFaculty[0] to max_mentees_per_faculty (5) first.
  const settings = unwrap(await supabase.from('portal_settings').select('max_mentees_per_faculty').eq('university_id', university.id).maybeSingle());
  const menteeCap = settings?.max_mentees_per_faculty ?? 5;
  for (const [i, studentId] of approvedOpportunity.entries()) {
    const opportunity = activeOpportunities[i % activeOpportunities.length];
    await safe(`opportunity application ${studentId}`, async () => {
      let application = unwrap(await supabase.from('opportunity_applications').select('*').eq('student_id', studentId).eq('opportunity_id', opportunity.id).maybeSingle());
      if (!application) {
        const mentor = nextCrcsMentor(menteeCap);
        const now = new Date().toISOString();
        [application] = unwrap(await supabase.from('opportunity_applications').insert({
          student_id: studentId, opportunity_id: opportunity.id, status: 'crcs_approved',
          assigned_mentor_id: mentor.id, mentor_assigned_by: admin.id, mentor_assigned_at: now, decision_by: admin.id, decision_at: now,
        }).select());
        stats.opportunityApps++;
        assignMentor(mentor.id);
        documentTargets.push({ studentId, relatedEntityType: 'opportunity_application', relatedEntityId: application.id, mentorId: mentor.id });
      }
    });
  }

  // --- Self-internships: activeSelf bucket. The first 10 are deliberately
  // left 'submitted' (6 with an offer letter attached, 4 without) so the
  // CRCS "Self-internship requests" approval queue has real pending work
  // instead of showing 0; the remaining 30 are 'active' as before. Company/HR
  // fields rotate through COMPANIES instead of one repeated literal.
  const PENDING_SELF_COUNT = 10;
  // Every pending self-internship gets its offer letter attached — a demo
  // record CRCS can never actually approve/reject (the real app blocks that
  // decision without one, see self-internship.js) is a dead end for testing,
  // not a useful edge case.
  const PENDING_SELF_WITH_OFFER = Infinity;
  for (const [i, studentId] of activeSelf.entries()) {
    await safe(`self-internship ${studentId}`, async () => {
      const company = companyFor(i);
      const isPending = i < PENDING_SELF_COUNT;
      let internship = unwrap(await supabase.from('self_internships').select('*').eq('student_id', studentId).eq('cycle_id', cycle.id).maybeSingle());
      if (!internship) {
        if (isPending) {
          [internship] = unwrap(await supabase.from('self_internships').insert({
            student_id: studentId, cycle_id: cycle.id, ...company, status: 'submitted',
          }).select());
        } else {
          const mentor = nextCrcsMentor(menteeCap);
          const now = pastTimestamp(studentId, 30);
          [internship] = unwrap(await supabase.from('self_internships').insert({
            student_id: studentId, cycle_id: cycle.id, ...company,
            status: 'active', assigned_mentor_id: mentor.id, mentor_decision_by: mentor.id, mentor_decision_at: now, crcs_decision_by: admin.id, crcs_decision_at: now,
          }).select());
          assignMentor(mentor.id);
          documentTargets.push({ studentId, relatedEntityType: 'self_internship', relatedEntityId: internship.id, mentorId: mentor.id });
        }
        stats.selfInternships++;
      } else {
        // Retrofit a row created by an earlier version of this script: fix
        // the repeated company literal, and flip the first 10 to 'submitted'
        // (nulling the mentor/decision fields a real 'submitted' row would
        // never have yet) so the CRCS approval queue has pending work.
        const patch = {};
        if (internship.company_name === 'Demo Bulk Employer Pvt Ltd') Object.assign(patch, company);
        if (isPending && internship.status !== 'submitted') {
          Object.assign(patch, { status: 'submitted', assigned_mentor_id: null, mentor_decision_by: null, mentor_decision_at: null, crcs_decision_by: null, crcs_decision_at: null });
        }
        if (Object.keys(patch).length) {
          unwrap(await supabase.from('self_internships').update(patch).eq('id', internship.id));
          internship = { ...internship, ...patch };
        }
        if (!isPending) documentTargets.push({ studentId, relatedEntityType: 'self_internship', relatedEntityId: internship.id, mentorId: internship.assigned_mentor_id });
      }
      if (isPending && i < PENDING_SELF_WITH_OFFER && internship && !internship.offer_letter_doc_id) {
        const fileName = `offer-letter-${studentId.slice(0, 8)}.txt`;
        const { filePath } = await saveFile({ studentId, originalName: fileName, buffer: Buffer.from(`Seeded demo offer letter for ${company.company_name}.`, 'utf8') });
        const [doc] = unwrap(await supabase.from('documents').insert({
          student_id: studentId, related_entity_type: 'self_internship', related_entity_id: internship.id,
          file_path: filePath, file_name: fileName,
        }).select());
        unwrap(await supabase.from('self_internships').update({ offer_letter_doc_id: doc.id }).eq('id', internship.id));
        stats.documents++;
      }
    });
  }

  // --- Pending/undecided bucket: 2-3 applications each, no approvals, so
  // exclusivity is never triggered for these students.
  const PENDING_RESEARCH_STATUSES = ['pending_faculty', 'faculty_approved', 'pending_crcs_approval'];
  const PENDING_OPPORTUNITY_STATUSES = ['applied', 'under_review', 'offered'];
  for (const [i, studentId] of pendingMixed.entries()) {
    const project = projects[(i + 2) % projects.length];
    const status = PENDING_RESEARCH_STATUSES[i % PENDING_RESEARCH_STATUSES.length];
    await safe(`pending research ${studentId}`, async () => {
      const existing = unwrap(await supabase.from('research_applications').select('id').eq('student_id', studentId).eq('project_id', project.id).maybeSingle());
      if (!existing) { unwrap(await supabase.from('research_applications').insert({ student_id: studentId, project_id: project.id, status })); stats.researchApps++; }
    });
    const opportunity = activeOpportunities[(i + 1) % activeOpportunities.length];
    const oppStatus = PENDING_OPPORTUNITY_STATUSES[i % PENDING_OPPORTUNITY_STATUSES.length];
    await safe(`pending opportunity ${studentId}`, async () => {
      const existing = unwrap(await supabase.from('opportunity_applications').select('id').eq('student_id', studentId).eq('opportunity_id', opportunity.id).maybeSingle());
      if (!existing) { unwrap(await supabase.from('opportunity_applications').insert({ student_id: studentId, opportunity_id: opportunity.id, status: oppStatus })); stats.opportunityApps++; }
    });
  }

  // --- Rejected/revoked bucket, split across research and opportunity so
  // both pathways exercise their rejection metadata.
  for (const [i, studentId] of rejectedEverywhere.entries()) {
    const project = projects[(i + 1) % projects.length];
    await safe(`rejected research ${studentId}`, async () => {
      const existing = unwrap(await supabase.from('research_applications').select('id').eq('student_id', studentId).eq('project_id', project.id).maybeSingle());
      if (!existing) {
        unwrap(await supabase.from('research_applications').insert({
          student_id: studentId, project_id: project.id, status: 'rejected',
          rejection_reason: 'Project capacity reassigned to a higher-priority applicant.', rejected_by_role: 'faculty', rejected_at_stage: 'faculty_decision',
          faculty_decision_by: project.faculty_id, faculty_decision_at: new Date().toISOString(),
        }));
        stats.researchApps++;
      }
    });
    const opportunity = activeOpportunities[i % activeOpportunities.length];
    await safe(`revoked opportunity ${studentId}`, async () => {
      const existing = unwrap(await supabase.from('opportunity_applications').select('id').eq('student_id', studentId).eq('opportunity_id', opportunity.id).maybeSingle());
      if (!existing) { unwrap(await supabase.from('opportunity_applications').insert({ student_id: studentId, opportunity_id: opportunity.id, status: 'revoked', rejection_reason: 'Withdrawn after selecting another pathway.' })); stats.opportunityApps++; }
    });
  }

  // --- Report deadlines: one CRCS universal default per template, plus a
  // handful of faculty overrides so override-wins-over-universal is visible.
  const dueUniversal = new Date(Date.now() + 14 * 86400000).toISOString();
  const universalDeadlines = {};
  for (const template of [weeklyTemplate, finalTemplate].filter(Boolean)) {
    await safe(`universal deadline ${template.name}`, async () => {
      let deadline = unwrap(await supabase.from('report_deadlines').select('*').is('student_id', null).eq('cycle_id', cycle.id).eq('report_template_id', template.id).maybeSingle());
      if (!deadline) {
        [deadline] = unwrap(await supabase.from('report_deadlines').insert({
          cycle_id: cycle.id, report_template_id: template.id, title: `${template.name} (cycle default)`, due_at: dueUniversal, assigned_by: admin.id,
        }).select());
        stats.deadlines++;
      }
      universalDeadlines[template.id] = deadline;
    });
  }
  const overrideTargets = documentTargets.slice(0, 5);
  const dueOverride = new Date(Date.now() + 7 * 86400000).toISOString();
  const overrideByStudent = {};
  for (const target of overrideTargets) {
    await safe(`override deadline ${target.studentId}`, async () => {
      let deadline = unwrap(await supabase.from('report_deadlines').select('*').eq('student_id', target.studentId).eq('related_entity_type', target.relatedEntityType).eq('related_entity_id', target.relatedEntityId).eq('report_template_id', weeklyTemplate.id).maybeSingle());
      if (!deadline) {
        [deadline] = unwrap(await supabase.from('report_deadlines').insert({
          student_id: target.studentId, related_entity_type: target.relatedEntityType, related_entity_id: target.relatedEntityId,
          report_template_id: weeklyTemplate.id, title: 'Weekly Report (mentor override)', due_at: dueOverride, assigned_by: target.mentorId,
        }).select());
        stats.deadlines++;
      }
      overrideByStudent[target.studentId] = deadline;
    });
  }

  // --- Documents, marks, attendance for every approved/active student.
  const reviewStatuses = ['pending', 'verified', 'revision_requested'];
  const requirements = unwrap(await supabase.from('report_requirements').select('id,report_template_id'));
  const requirementByTemplate = Object.fromEntries(requirements.map((r) => [r.report_template_id, r.id]));
  for (const [i, target] of documentTargets.entries()) {
    const effectiveDeadline = overrideByStudent[target.studentId] ?? universalDeadlines[weeklyTemplate.id];
    const fileName = `weekly-report-week1-${target.studentId.slice(0, 8)}.txt`;
    await safe(`document ${target.studentId}`, async () => {
      const existing = unwrap(await supabase.from('documents').select('id').eq('student_id', target.studentId).eq('related_entity_type', target.relatedEntityType).eq('related_entity_id', target.relatedEntityId).eq('file_name', fileName).maybeSingle());
      if (!existing) {
        const { filePath } = await saveFile({ studentId: target.studentId, originalName: fileName, buffer: Buffer.from('Seeded demo weekly report content.', 'utf8') });
        unwrap(await supabase.from('documents').insert({
          student_id: target.studentId, related_entity_type: target.relatedEntityType, related_entity_id: target.relatedEntityId,
          report_template_id: weeklyTemplate.id, report_deadline_id: effectiveDeadline?.id ?? null, file_path: filePath, file_name: fileName,
          review_status: reviewStatuses[i % reviewStatuses.length],
          reviewed_by: reviewStatuses[i % reviewStatuses.length] === 'pending' ? null : target.mentorId,
          reviewed_at: reviewStatuses[i % reviewStatuses.length] === 'pending' ? null : new Date().toISOString(),
        }));
        stats.documents++;
      }
    });
    if (weeklyTemplate && requirementByTemplate[weeklyTemplate.id]) {
      await safe(`score ${target.studentId}`, async () => {
        const existing = unwrap(await supabase.from('student_report_scores').select('id').eq('student_id', target.studentId).eq('cycle_id', cycle.id).eq('report_requirement_id', requirementByTemplate[weeklyTemplate.id]).maybeSingle());
        if (!existing) {
          unwrap(await supabase.from('student_report_scores').insert({ student_id: target.studentId, cycle_id: cycle.id, report_requirement_id: requirementByTemplate[weeklyTemplate.id], score: 6 + (i % 5), entered_by: target.mentorId }));
          stats.scores++;
        }
      });
    }
    for (const week of WEEKS) {
      await safe(`attendance ${target.studentId} week ${week}`, async () => {
        const existing = unwrap(await supabase.from('weekly_attendance').select('id').eq('student_id', target.studentId).eq('related_entity_type', target.relatedEntityType).eq('related_entity_id', target.relatedEntityId).eq('week_number', week).maybeSingle());
        if (!existing) {
          unwrap(await supabase.from('weekly_attendance').insert({
            student_id: target.studentId, faculty_id: target.mentorId, related_entity_type: target.relatedEntityType, related_entity_id: target.relatedEntityId,
            week_number: week, present: (i + week) % 5 !== 0, marked_by: target.mentorId,
          }));
          stats.attendance++;
        }
      });
    }
  }

  // --- Spread decision timestamps so "Recent approvals" doesn't show every
  // row decided in the same second. Deterministic per-id offset (see
  // pastTimestamp) so this converges instead of reshuffling on every re-run.
  await safe('spread research decision timestamps', async () => {
    const rows = unwrap(await supabase.from('research_applications').select('id,crcs_decision_at,faculty_decision_at').in('project_id', projects.map((p) => p.id)).not('crcs_decision_at', 'is', null));
    for (const row of rows) {
      const decidedAt = pastTimestamp(row.id, 45);
      unwrap(await supabase.from('research_applications').update({ crcs_decision_at: decidedAt, faculty_decision_at: row.faculty_decision_at ? decidedAt : row.faculty_decision_at }).eq('id', row.id));
    }
  });
  await safe('spread self-internship decision timestamps', async () => {
    const rows = unwrap(await supabase.from('self_internships').select('id,crcs_decision_at,mentor_decision_at').eq('cycle_id', cycle.id).not('crcs_decision_at', 'is', null));
    for (const row of rows) {
      const decidedAt = pastTimestamp(row.id, 45);
      unwrap(await supabase.from('self_internships').update({ crcs_decision_at: decidedAt, mentor_decision_at: row.mentor_decision_at ? decidedAt : row.mentor_decision_at }).eq('id', row.id));
    }
  });

  // A real student always has a student_track_selections row before they can
  // ever apply anywhere — the app enforces this, so direct-insert seeding is
  // the only way to skip it. Without one, "My Applications"/"Choose Path"
  // fall back to a generic "Internship track" label and CRCS's preference
  // unlock action 409s with "student has not selected a preference".
  await safe('backfill missing track selections', async () => {
    const [researchRows, opportunityRows, selfRows] = await Promise.all([
      supabase.from('research_applications').select('student_id,project_id'),
      supabase.from('opportunity_applications').select('student_id,opportunity_id'),
      supabase.from('self_internships').select('student_id,cycle_id').eq('cycle_id', cycle.id),
    ]);
    const projectCycleById = Object.fromEntries(projects.map((p) => [p.id, p.cycle_id]));
    const opportunityCycleById = Object.fromEntries(unwrap(await supabase.from('crcs_opportunities').select('id,cycle_id').eq('cycle_id', cycle.id)).map((o) => [o.id, o.cycle_id]));
    const existing = new Set(unwrap(await supabase.from('student_track_selections').select('student_id,cycle_id').eq('cycle_id', cycle.id)).map((row) => `${row.student_id}:${row.cycle_id}`));
    const candidates = [
      ...unwrap(researchRows).map((r) => ({ student_id: r.student_id, cycle_id: projectCycleById[r.project_id], track: 'research' })),
      ...unwrap(opportunityRows).map((r) => ({ student_id: r.student_id, cycle_id: opportunityCycleById[r.opportunity_id], track: 'crcs_opportunity' })),
      ...unwrap(selfRows).map((r) => ({ student_id: r.student_id, cycle_id: r.cycle_id, track: 'self_internship' })),
    ].filter((row) => row.cycle_id === cycle.id && !existing.has(`${row.student_id}:${row.cycle_id}`));
    const seen = new Set();
    for (const row of candidates) {
      const key = `${row.student_id}:${row.cycle_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unwrap(await supabase.from('student_track_selections').insert(row));
      stats.trackSelections++;
    }
  });

  console.log(JSON.stringify({
    university: UNIVERSITY_CODE, cycle: CYCLE_NAME, studentsSeeded: documentTargets.length,
    projectsCreated: stats.projects, researchApplicationsCreated: stats.researchApps, mentorAssignmentsCreated: stats.mentorAssignments,
    opportunitiesCreated: stats.opportunities, opportunityApplicationsCreated: stats.opportunityApps, selfInternshipsCreated: stats.selfInternships,
    documentsCreated: stats.documents, scoresCreated: stats.scores, attendanceCreated: stats.attendance, deadlinesCreated: stats.deadlines,
    trackSelectionsBackfilled: stats.trackSelections,
    maxedProject: projects[0]?.id, maxedMentor: crcsFaculty[0]?.id, errorCount: stats.errors.length, firstErrors: stats.errors.slice(0, 10),
  }, null, 2));
}

main().catch((error) => {
  console.error('[seed:srmap-demo-activity] failed:', error.message);
  process.exit(1);
});
