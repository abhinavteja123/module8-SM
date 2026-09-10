import { Router } from 'express';
import { z } from 'zod';
import { supabase, unwrap } from '../db/client.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';
import { findApprovedInternship } from '../lib/internshipExclusivity.js';
import { requireStudentPortalUnlocked } from '../lib/portalLocks.js';
import { canViewCycleHistory, isExpiredCycle } from '../lib/cycleVisibility.js';

const router = Router();
const CYCLE_AUDIENCES = ['student', 'faculty', 'faculty_coordinator', 'hod', 'dean', 'school_office', 'crcs_coordinator', 'crcs_superadmin'];
const cycleAudienceSchema = z.enum([...CYCLE_AUDIENCES, 'all']);

const CYCLE_SETUP_ROLES = ['crcs_superadmin'];
const CYCLE_OVERSIGHT_ROLES = ['crcs_superadmin', 'crcs_coordinator', 'hod', 'faculty_coordinator', 'dean', 'school_office'];

function isCycleOversightUser(req) {
  return req.user.roles.some((role) => CYCLE_OVERSIGHT_ROLES.includes(role.role));
}

router.get('/cycles', requireAuth, async (req, res) => {
  const cycles = unwrap(await supabase.from('internship_cycles').select('*').order('preference_window_opens_at', { ascending: false }));
  if (canViewCycleHistory(req.user)) return res.json(cycles);
  const memberships = unwrap(await supabase.from('cycle_participants').select('cycle_id').eq('user_id', req.user.id));
  const visibleIds = new Set(memberships.map((membership) => membership.cycle_id));
  // A normal dashboard user only sees cycles they have actually joined.  This
  // makes the required-document gate an enrolment/onboarding action: a person
  // added later receives the same acknowledgement before entering that cycle.
  res.json(cycles.filter((cycle) => visibleIds.has(cycle.id) && !isExpiredCycle(cycle)).map((cycle) => ({ ...cycle, is_participant: true })));
});

async function canViewCycle(req, cycle) {
  if (isExpiredCycle(cycle) && !canViewCycleHistory(req.user)) return false;
  if (isCycleOversightUser(req)) return true;
  const membership = unwrap(await supabase.from('cycle_participants').select('id').eq('cycle_id', cycle.id).eq('user_id', req.user.id).maybeSingle());
  return Boolean(membership);
}

function countBy(rows, key) {
  return rows.reduce((counts, row) => ({ ...counts, [row[key]]: (counts[row[key]] ?? 0) + 1 }), {});
}

router.get('/cycles/:id/summary', requireAuth, async (req, res) => {
  const cycle = unwrap(await supabase.from('internship_cycles').select('*').eq('id', req.params.id).maybeSingle());
  if (!cycle) return res.status(404).json({ error: 'internship cycle not found' });
  if (!(await canViewCycle(req, cycle))) return res.status(isExpiredCycle(cycle) ? 410 : 403).json({ error: isExpiredCycle(cycle) ? 'this internship cycle has ended and is no longer available in your workspace' : 'this cycle is outside your workspace' });
  const [participantsResult, selectionsResult, projectsResult, opportunitiesResult, internshipsResult, marksResult] = await Promise.all([
    supabase.from('cycle_participants').select('user_id,participant_type').eq('cycle_id', cycle.id),
    supabase.from('student_track_selections').select('student_id,track').eq('cycle_id', cycle.id),
    supabase.from('research_projects').select('id,status').eq('cycle_id', cycle.id),
    supabase.from('crcs_opportunities').select('id,is_active').eq('cycle_id', cycle.id),
    supabase.from('self_internships').select('id,status').eq('cycle_id', cycle.id),
    supabase.from('marks').select('id').eq('cycle_id', cycle.id),
  ]);
  const participants = unwrap(participantsResult);
  const selections = unwrap(selectionsResult);
  const projects = unwrap(projectsResult);
  const opportunities = unwrap(opportunitiesResult);
  const internships = unwrap(internshipsResult);
  const marks = unwrap(marksResult);
  const [researchApplicationsResult, opportunityApplicationsResult] = await Promise.all([
    projects.length ? supabase.from('research_applications').select('status').in('project_id', projects.map((project) => project.id)) : Promise.resolve({ data: [], error: null }),
    opportunities.length ? supabase.from('opportunity_applications').select('status').in('opportunity_id', opportunities.map((opportunity) => opportunity.id)) : Promise.resolve({ data: [], error: null }),
  ]);
  const researchApplications = unwrap(researchApplicationsResult);
  const opportunityApplications = unwrap(opportunityApplicationsResult);
  const students = new Set([...participants.filter((participant) => participant.participant_type === 'student').map((participant) => participant.user_id), ...selections.map((selection) => selection.student_id)]);
  res.json({
    student_count: students.size,
    faculty_count: new Set(participants.filter((participant) => participant.participant_type === 'faculty').map((participant) => participant.user_id)).size,
    research_projects: projects.length,
    active_opportunities: opportunities.filter((opportunity) => opportunity.is_active).length,
    self_internships: internships.length,
    marks_entered: marks.length,
    students_by_track: countBy(selections, 'track'),
    research_applications_by_status: countBy(researchApplications, 'status'),
    opportunity_applications_by_status: countBy(opportunityApplications, 'status'),
    self_internships_by_status: countBy(internships, 'status'),
  });
});

router.get('/cycles/current', requireAuth, async (req, res) => {
  const cycle = unwrap(
    await supabase.from('internship_cycles').select('*').eq('status', 'open')
      .order('preference_window_opens_at', { ascending: false }).limit(1).maybeSingle()
  );
  if (!cycle) return res.status(404).json({ error: 'no open cycle' });
  res.json(cycle);
});

const cycleSchema = z.object({
  name: z.string().min(1),
  preference_window_opens_at: z.string(),
  preference_window_closes_at: z.string().optional(),
  batch_label: z.string().trim().max(100).optional(),
  guidelines: z.string().trim().max(5000).optional(),
});

router.post('/cycles', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const parsed = cycleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { name, preference_window_opens_at, preference_window_closes_at, batch_label, guidelines } = parsed.data;
  const [cycle] = unwrap(await supabase.from('internship_cycles').insert({
    name, preference_window_opens_at, preference_window_closes_at: preference_window_closes_at ?? null,
    batch_label: batch_label || null, guidelines: guidelines || null,
    status: 'not_started', created_by: req.user.id,
  }).select());
  const fixedOrganisationPeople = await enrolFixedOrganisationPeople(cycle, req.user.id);
  await logAudit({
    actorId: req.user.id, actorRole: 'crcs_superadmin', action: 'create_cycle',
    entityType: 'internship_cycles', entityId: cycle.id, newValue: { ...cycle, fixed_organisation_people: fixedOrganisationPeople },
  });
  res.status(201).json(cycle);
});

// Discarding is deliberately draft-only. An open/closed cycle is institutional
// history and must never disappear through the setup screen.
router.delete('/cycles/:id', requireAuth, requireRole('crcs_superadmin'), async (req, res) => {
  const cycle = unwrap(await supabase.from('internship_cycles').select('id,name,status').eq('id', req.params.id).maybeSingle());
  if (!cycle) return res.status(404).json({ error: 'internship cycle not found' });
  if (cycle.status !== 'not_started') return res.status(409).json({ error: 'only an unpublished draft cycle can be deleted' });
  const activityTables = ['student_track_selections', 'research_projects', 'crcs_opportunities', 'self_internships', 'marks'];
  const activity = await Promise.all(activityTables.map((table) => supabase.from(table).select('id').eq('cycle_id', cycle.id).limit(1).maybeSingle()));
  if (activity.some((result) => unwrap(result))) return res.status(409).json({ error: 'this draft has internship activity and cannot be deleted' });
  unwrap(await supabase.from('internship_cycles').delete().eq('id', cycle.id));
  await logAudit({ actorId: req.user.id, actorRole: 'crcs_superadmin', action: 'delete_draft_cycle', entityType: 'internship_cycles', entityId: cycle.id, oldValue: cycle });
  res.status(204).end();
});

const cycleGuidelinesSchema = z.object({ guidelines: z.string().trim().min(3).max(5000) });

router.patch('/cycles/:id/guidelines', requireAuth, requireRole(...CYCLE_SETUP_ROLES), async (req, res) => {
  const parsed = cycleGuidelinesSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const cycle = await draftCycle(req.params.id);
  if (!cycle) return res.status(404).json({ error: 'internship cycle not found' });
  if (cycle.status !== 'not_started') return res.status(409).json({ error: 'guidelines can only be changed while the cycle is a draft' });
  const [updated] = unwrap(await supabase.from('internship_cycles').update({ guidelines: parsed.data.guidelines }).eq('id', cycle.id).select());
  await logAudit({ actorId: req.user.id, actorRole: 'crcs_superadmin', action: 'set_cycle_guidelines', entityType: 'internship_cycles', entityId: cycle.id, newValue: { guidelines: updated.guidelines } });
  res.json(updated);
});

const participantSchema = z.object({
  participant_type: cycleAudienceSchema,
  user_ids: z.array(z.string().uuid()).min(1).max(1000),
  category: z.string().trim().max(100).optional(),
  source: z.enum(['existing', 'bulk_import']).default('existing'),
});

const cyclePeopleSearchSchema = z.object({
  participant_type: cycleAudienceSchema,
  q: z.string().trim().min(2).max(100),
  cycle_id: z.string().uuid(),
  scope: z.enum(['university', 'school', 'department']).default('university'),
  school_id: z.string().uuid().optional(),
  department_id: z.string().uuid().optional(),
}).superRefine((value, context) => {
  if (value.scope === 'school' && !value.school_id) context.addIssue({ code: z.ZodIssueCode.custom, message: 'choose a school' });
  if (value.scope === 'department' && !value.department_id) context.addIssue({ code: z.ZodIssueCode.custom, message: 'choose a department' });
});

const audienceScopeSchema = z.object({
  participant_type: cycleAudienceSchema,
  scope: z.enum(['university', 'school', 'department']).default('university'),
  school_id: z.string().uuid().optional(),
  department_id: z.string().uuid().optional(),
  cycle_id: z.string().uuid().optional(),
}).superRefine((value, context) => {
  if (value.scope === 'school' && !value.school_id) context.addIssue({ code: z.ZodIssueCode.custom, message: 'choose a school' });
  if (value.scope === 'department' && !value.department_id) context.addIssue({ code: z.ZodIssueCode.custom, message: 'choose a department' });
});

async function scopedDepartmentIds(scope) {
  if (scope.scope === 'university') return null;
  if (scope.scope === 'department') {
    const department = unwrap(await supabase.from('departments').select('id').eq('id', scope.department_id).maybeSingle());
    if (!department) throw new Error('department not found');
    return [department.id];
  }
  const departments = unwrap(await supabase.from('departments').select('id').eq('school_id', scope.school_id));
  return departments.map((department) => department.id);
}

async function activeScopedProfiles(scope) {
  if (scope.participant_type === 'all') {
    const groups = await Promise.all(CYCLE_AUDIENCES.map((participant_type) => activeScopedProfiles({ ...scope, participant_type })));
    const priority = Object.fromEntries(CYCLE_AUDIENCES.map((type, index) => [type, index]));
    const unique = new Map();
    groups.flat().sort((left, right) => priority[left.participant_type] - priority[right.participant_type]).forEach((profile) => { if (!unique.has(profile.id)) unique.set(profile.id, profile); });
    return [...unique.values()];
  }
  if (!['student', 'faculty'].includes(scope.participant_type)) {
    const roles = unwrap(await supabase.from('user_roles').select('user_id,department_id,school_id').eq('role', scope.participant_type));
    const departmentIds = [...new Set(roles.map((role) => role.department_id).filter(Boolean))];
    const departments = departmentIds.length ? unwrap(await supabase.from('departments').select('id,school_id').in('id', departmentIds)) : [];
    const schoolByDepartment = Object.fromEntries(departments.map((department) => [department.id, department.school_id]));
    const scoped = roles.map((role) => ({ id: role.user_id, department_id: role.department_id ?? null, school_id: role.school_id ?? schoolByDepartment[role.department_id] ?? null, participant_type: scope.participant_type }));
    const active = new Set();
    for (let start = 0; start < scoped.length; start += 500) unwrap(await supabase.from('users').select('id').eq('is_active', true).in('id', scoped.slice(start, start + 500).map((profile) => profile.id))).forEach((user) => active.add(user.id));
    return scoped.filter((profile) => active.has(profile.id) && (scope.scope === 'university' || (scope.scope === 'school' && profile.school_id === scope.school_id) || (scope.scope === 'department' && profile.department_id === scope.department_id)));
  }
  const table = scope.participant_type === 'student' ? 'students' : 'faculty';
  const fields = scope.participant_type === 'student' ? 'id,roll_number,department_id' : 'id,department_id';
  const departmentIds = await scopedDepartmentIds(scope);
  if (departmentIds?.length === 0) return [];
  const profiles = [];
  for (let start = 0; ; start += 1000) {
    let query = supabase.from(table).select(fields).range(start, start + 999);
    if (departmentIds) query = query.in('department_id', departmentIds);
    const page = unwrap(await query);
    profiles.push(...page);
    if (page.length < 1000) break;
  }
  const activeIds = new Set();
  for (let start = 0; start < profiles.length; start += 500) {
    const users = unwrap(await supabase.from('users').select('id').eq('is_active', true).in('id', profiles.slice(start, start + 500).map((profile) => profile.id)));
    users.forEach((user) => activeIds.add(user.id));
  }
  // Faculty Coordinators also have a faculty profile for dashboard access, but
  // their cycle role must remain Faculty Coordinator rather than Faculty Mentor.
  const facultyRoleIds = scope.participant_type === 'faculty' && profiles.length
    ? new Set(unwrap(await supabase.from('user_roles').select('user_id').eq('role', 'faculty').in('user_id', profiles.map((profile) => profile.id))).map((role) => role.user_id))
    : null;
  return profiles.filter((profile) => activeIds.has(profile.id) && (!facultyRoleIds || facultyRoleIds.has(profile.id))).map((profile) => ({ ...profile, participant_type: scope.participant_type }));
}

async function fixedOrganisationProfiles() {
  const roles = CYCLE_AUDIENCES.filter((role) => role !== 'student');
  const groups = await Promise.all(roles.map((participant_type) => activeScopedProfiles({ participant_type, scope: 'university' })));
  const profiles = new Map();
  groups.flat().forEach((profile) => { if (!profiles.has(profile.id)) profiles.set(profile.id, profile); });
  return [...profiles.values()];
}

async function enrolProfiles({ cycle, profiles, participantType, actorId, source = 'existing' }) {
  const departmentIds = [...new Set(profiles.map((profile) => profile.department_id).filter(Boolean))];
  const departments = departmentIds.length ? unwrap(await supabase.from('departments').select('id,school_id').in('id', departmentIds)) : [];
  const schoolByDepartment = Object.fromEntries(departments.map((department) => [department.id, department.school_id]));
  const rows = profiles.map((profile) => ({ cycle_id: cycle.id, user_id: profile.id, participant_type: profile.participant_type ?? participantType, category: null, department_id: profile.department_id ?? null, school_id: profile.school_id ?? schoolByDepartment[profile.department_id] ?? null, source, enrolled_by: actorId }));
  for (let start = 0; start < rows.length; start += 500) unwrap(await supabase.from('cycle_participants').upsert(rows.slice(start, start + 500), { onConflict: 'cycle_id,user_id' }));
  return rows.length;
}

async function enrolFixedOrganisationPeople(cycle, actorId) {
  const profiles = await fixedOrganisationProfiles();
  return enrolProfiles({ cycle, profiles, participantType: 'faculty', actorId, source: 'existing' });
}

router.get('/cycles/people/count', requireAuth, requireRole(...CYCLE_SETUP_ROLES), async (req, res) => {
  const parsed = audienceScopeSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const profiles = await activeScopedProfiles(parsed.data);
  const enrolled = parsed.data.cycle_id ? unwrap(await supabase.from('cycle_participants').select('user_id').eq('cycle_id', parsed.data.cycle_id)) : [];
  const enrolledIds = new Set(enrolled.map((row) => row.user_id));
  const eligible = profiles.filter((profile) => !enrolledIds.has(profile.id));
  res.json({ count: eligible.length, total: profiles.length, enrolled_count: profiles.length - eligible.length, participant_type: parsed.data.participant_type, scope: parsed.data.scope });
});

router.get('/cycles/people', requireAuth, requireRole(...CYCLE_SETUP_ROLES), async (req, res) => {
  const parsed = cyclePeopleSearchSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'choose an audience, scope, and a search of at least two characters' });
  const term = parsed.data.q.replace(/[%_]/g, '').trim();
  if (term.length < 2) return res.json([]);
  const pattern = `%${term}%`;
  const [byName, byEmail, profiles] = await Promise.all([
    supabase.from('users').select('id,full_name,email').eq('is_active', true).ilike('full_name', pattern).order('full_name').limit(25),
    supabase.from('users').select('id,full_name,email').eq('is_active', true).ilike('email', pattern).order('full_name').limit(25),
    activeScopedProfiles(parsed.data),
  ]);
  const peopleById = new Map([...unwrap(byName), ...unwrap(byEmail)].map((person) => [person.id, person]));
  const rollMatches = profiles.filter((profile) => profile.roll_number?.toLowerCase().includes(term.toLowerCase()));
  const rollOnlyIds = rollMatches.map((profile) => profile.id).filter((id) => !peopleById.has(id));
  if (rollOnlyIds.length) unwrap(await supabase.from('users').select('id,full_name,email').eq('is_active', true).in('id', rollOnlyIds)).forEach((person) => peopleById.set(person.id, person));
  const people = [...peopleById.values()];
  if (!people.length) return res.json([]);
  const profileById = Object.fromEntries(profiles.map((profile) => [profile.id, profile]));
  const enrolled = unwrap(await supabase.from('cycle_participants').select('user_id').eq('cycle_id', parsed.data.cycle_id));
  const enrolledIds = new Set(enrolled.map((participant) => participant.user_id));
  res.json(people.filter((person) => profileById[person.id] && !enrolledIds.has(person.id)).map((person) => ({ ...person, ...profileById[person.id] })).slice(0, 20));
});

async function draftCycle(id) {
  return unwrap(await supabase.from('internship_cycles').select('*').eq('id', id).maybeSingle());
}

router.get('/cycles/:id/participants', requireAuth, requireRole(...CYCLE_SETUP_ROLES), async (req, res) => {
  const cycle = await draftCycle(req.params.id);
  if (!cycle) return res.status(404).json({ error: 'internship cycle not found' });
  const rows = unwrap(await supabase.from('cycle_participants').select('*').eq('cycle_id', cycle.id).order('enrolled_at', { ascending: false }));
  const userIds = [...new Set(rows.map((row) => row.user_id))];
  const people = userIds.length ? unwrap(await supabase.from('users').select('id,full_name,email').in('id', userIds)) : [];
  const personById = Object.fromEntries(people.map((person) => [person.id, person]));
  res.json({ cycle, participants: rows.map((row) => ({ ...row, user: personById[row.user_id] ?? null })) });
});

router.post('/cycles/:id/participants', requireAuth, requireRole(...CYCLE_SETUP_ROLES), async (req, res) => {
  const parsed = participantSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const cycle = await draftCycle(req.params.id);
  if (!cycle) return res.status(404).json({ error: 'internship cycle not found' });
  if (cycle.status === 'closed') return res.status(409).json({ error: 'participants cannot be changed once a cycle is closed' });
  const { participant_type, user_ids, category, source } = parsed.data;
  const profiles = (await activeScopedProfiles({ participant_type, scope: 'university' })).filter((profile) => user_ids.includes(profile.id));
  if (profiles.length !== user_ids.length) return res.status(400).json({ error: `every selected person must be an onboarded ${participant_type}` });
  const added = await enrolProfiles({ cycle, profiles, participantType: participant_type, actorId: req.user.id, source });
  await logAudit({ actorId: req.user.id, actorRole: 'crcs_superadmin', action: 'enrol_cycle_participants', entityType: 'internship_cycles', entityId: cycle.id, newValue: { participant_type, count: added, category: category || null, source } });
  res.status(201).json({ added });
});

router.post('/cycles/:id/participants/select-all', requireAuth, requireRole(...CYCLE_SETUP_ROLES), async (req, res) => {
  const parsed = audienceScopeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const cycle = await draftCycle(req.params.id);
  if (!cycle) return res.status(404).json({ error: 'internship cycle not found' });
  if (cycle.status === 'closed') return res.status(409).json({ error: 'participants cannot be changed once a cycle is closed' });
  const profiles = await activeScopedProfiles(parsed.data);
  const enrolled = unwrap(await supabase.from('cycle_participants').select('user_id').eq('cycle_id', cycle.id));
  const enrolledIds = new Set(enrolled.map((row) => row.user_id));
  const eligible = profiles.filter((profile) => !enrolledIds.has(profile.id));
  const added = await enrolProfiles({ cycle, profiles: eligible, participantType: parsed.data.participant_type, actorId: req.user.id });
  await logAudit({ actorId: req.user.id, actorRole: 'crcs_superadmin', action: 'enrol_cycle_audience', entityType: 'internship_cycles', entityId: cycle.id, newValue: { participant_type: parsed.data.participant_type, scope: parsed.data.scope, school_id: parsed.data.school_id ?? null, department_id: parsed.data.department_id ?? null, count: added } });
  res.status(201).json({ added });
});

router.post('/cycles/:id/publish', requireAuth, requireRole(...CYCLE_SETUP_ROLES), async (req, res) => {
  const cycle = await draftCycle(req.params.id);
  if (!cycle) return res.status(404).json({ error: 'internship cycle not found' });
  if (cycle.status !== 'not_started') return res.status(409).json({ error: 'only a draft cycle can be published' });
  const [participantsResult, documentsResult] = await Promise.all([
    supabase.from('cycle_participants').select('participant_type').eq('cycle_id', cycle.id),
    supabase.from('cycle_guideline_documents').select('id').eq('cycle_id', cycle.id).eq('is_required', true).is('retired_at', null).limit(1),
  ]);
  const participants = unwrap(participantsResult);
  const documents = unwrap(documentsResult);
  if (!participants.some((participant) => participant.participant_type === 'student')) return res.status(409).json({ error: 'enrol at least one student before publishing' });
  if (!participants.some((participant) => participant.participant_type === 'faculty')) return res.status(409).json({ error: 'enrol at least one faculty member before publishing' });
  if (!documents.length) return res.status(409).json({ error: 'upload at least one required cycle document before publishing' });
  unwrap(await supabase.from('internship_cycles').update({ status: 'closed' }).eq('status', 'open'));
  const [published] = unwrap(await supabase.from('internship_cycles').update({ status: 'open' }).eq('id', cycle.id).select());
  await logAudit({ actorId: req.user.id, actorRole: 'crcs_superadmin', action: 'publish_cycle', entityType: 'internship_cycles', entityId: cycle.id, oldValue: { status: cycle.status }, newValue: { status: published.status } });
  res.json(published);
});

const trackSelectionSchema = z.object({
  cycle_id: z.string().uuid(),
  track: z.enum(['research', 'crcs_opportunity', 'self_internship']),
  questionnaire_response: z.record(z.any()).optional(),
});

async function hasApprovedInternship(studentId) {
  return Boolean(await findApprovedInternship(studentId));
}

router.post('/students/me/track-selection', requireAuth, requireRole('student'), async (req, res) => {
  const parsed = trackSelectionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!(await requireStudentPortalUnlocked(req, res))) return;
  const { cycle_id, track, questionnaire_response } = parsed.data;
  const cycle = unwrap(await supabase.from('internship_cycles').select('id,preference_changes_locked,status').eq('id', cycle_id).maybeSingle());
  if (!cycle) return res.status(404).json({ error: 'internship cycle not found' });
  if (cycle.status !== 'open') return res.status(409).json({ error: 'this cycle is read-only until it is published as open' });
  const current = unwrap(await supabase.from('student_track_selections').select('*').eq('student_id', req.user.id).eq('cycle_id', cycle_id).order('created_at', { ascending: false }).limit(1).maybeSingle());
  if (await hasApprovedInternship(req.user.id)) {
    if (current?.track === track) return res.json({ selection: current, unchanged: true, approval_locked: true });
    return res.status(403).json({ error: 'your internship preference is locked after approval. Please contact the CRCS administrator in person if a change is needed.' });
  }

  if (cycle.preference_changes_locked && current && current.track !== track) {
    const pending = unwrap(await supabase.from('student_preference_change_requests').select('id').eq('student_id', req.user.id).eq('cycle_id', cycle_id).eq('status', 'pending').maybeSingle());
    if (pending) return res.status(409).json({ error: 'a preference-change request is already waiting for CRCS' });
    const [request] = unwrap(await supabase.from('student_preference_change_requests').insert({ student_id: req.user.id, cycle_id, current_track: current.track, requested_track: track }).select());
    await logAudit({ actorId: req.user.id, actorRole: 'student', action: 'request_track_change', entityType: 'student_preference_change_requests', entityId: request.id, newValue: { current_track: current.track, requested_track: track } });
    return res.status(202).json({ requires_approval: true, request });
  }

  if (cycle.preference_changes_locked && current?.track === track) return res.json({ selection: current, unchanged: true });
  unwrap(await supabase.from('student_track_selections').delete().eq('student_id', req.user.id).eq('cycle_id', cycle_id));
  const [selection] = unwrap(await supabase.from('student_track_selections').insert({ student_id: req.user.id, cycle_id, track, questionnaire_response: questionnaire_response ?? null }).select());
  await logAudit({ actorId: req.user.id, actorRole: 'student', action: 'select_internship_track', entityType: 'student_track_selections', entityId: selection.id, newValue: { cycle_id, track } });
  res.status(201).json({ selection });
});

// This is deliberately independent of the currently open cycle. A student
// must not see another Apply action merely because CRCS has closed the cycle
// in which their internship was approved.
router.get('/students/me/internship-status', requireAuth, requireRole('student'), async (req, res) => {
  const internship = await findApprovedInternship(req.user.id);
  res.json({ approved: Boolean(internship), internship });
});

router.get('/students/me/track-selection', requireAuth, requireRole('student'), async (req, res) => {
  const cycleId = req.query.cycle_id;
  const cycle = cycleId
    ? unwrap(await supabase.from('internship_cycles').select('id,name,status,preference_changes_locked').eq('id', cycleId).maybeSingle())
    : unwrap(await supabase.from('internship_cycles').select('id,name,status,preference_changes_locked').eq('status', 'open').order('preference_window_opens_at', { ascending: false }).limit(1).maybeSingle());
  if (!cycle) return res.status(404).json({ error: 'no internship cycle found' });
  if (isExpiredCycle(cycle)) return res.status(410).json({ error: 'this internship cycle has ended and is no longer available in your workspace' });
  const selection = unwrap(await supabase.from('student_track_selections').select('*').eq('student_id', req.user.id).eq('cycle_id', cycle.id).order('created_at', { ascending: false }).limit(1).maybeSingle());
  const pendingRequest = unwrap(await supabase.from('student_preference_change_requests').select('*').eq('student_id', req.user.id).eq('cycle_id', cycle.id).eq('status', 'pending').maybeSingle());
  res.json({ cycle, selection: selection ?? null, pending_request: pendingRequest ?? null, approval_locked: await hasApprovedInternship(req.user.id) });
});

const questionnaireSchema = z.object({ cycle_id: z.string().uuid(), responses: z.record(z.any()) });

router.post('/students/me/questionnaire', requireAuth, requireRole('student'), async (req, res) => {
  const parsed = questionnaireSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!(await requireStudentPortalUnlocked(req, res))) return;
  const { cycle_id, responses } = parsed.data;
  const cycle = unwrap(await supabase.from('internship_cycles').select('id,status').eq('id', cycle_id).maybeSingle());
  if (!cycle) return res.status(404).json({ error: 'internship cycle not found' });
  if (isExpiredCycle(cycle)) return res.status(410).json({ error: 'this internship cycle has ended and is no longer available in your workspace' });
  const rows = unwrap(
    await supabase.from('student_track_selections').update({ questionnaire_response: responses })
      .eq('student_id', req.user.id).eq('cycle_id', cycle_id).select()
  );
  if (!rows.length) return res.status(404).json({ error: 'no track selection found for this cycle — select a track first' });
  res.json(rows[0]);
});

export default router;
