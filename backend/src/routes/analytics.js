import { Router } from 'express';
import { z } from 'zod';
import { supabase, unwrap } from '../db/client.js';
import { requireAuth, requireRole, requireCrcsPermission } from '../middleware/auth.js';
import { requireVisibleCycle } from '../lib/cycleVisibility.js';
import { getSignedUrl } from '../lib/storage.js';

const router = Router();

// Scope is derived from the verified user's roles. A department/school value in
// the URL would be an escalation primitive, so the analytics API never accepts one.
const ANALYTICS_ROLES = ['crcs_superadmin', 'crcs_coordinator', 'dean', 'school_office', 'hod', 'faculty_coordinator', 'faculty'];
const drilldownMetrics = ['pending_reviews', 'overdue_reports', 'missing_acknowledgements', 'unassigned_active_internships', 'duplicate_active_applications', 'missing_cycle_enrolment', 'capacity_risk', 'pending_unlock_requests', 'inconsistent_statuses'];
const cycleQuery = z.object({ cycle_id: z.string().uuid() });
const drilldownQuery = cycleQuery.extend({ metric: z.enum(drilldownMetrics), limit: z.coerce.number().int().min(1).max(500).default(100) });
const exportQuery = cycleQuery.extend({ view: z.enum([...drilldownMetrics, 'overview', 'internship_outcomes']), format: z.enum(['csv', 'pdf']).default('csv') });

function deriveViewerScope(user) {
  const roles = user.roles ?? [];
  if (roles.some((role) => ['crcs_superadmin', 'crcs_coordinator'].includes(role.role))) return { type: 'system', departmentIds: [], schoolIds: [], facultyId: null, isSystem: true };
  const schoolIds = [...new Set(roles.filter((role) => ['dean', 'school_office'].includes(role.role)).map((role) => role.school_id).filter(Boolean))];
  if (schoolIds.length) return { type: 'school', departmentIds: [], schoolIds, facultyId: null, isSystem: false };
  const departmentIds = [...new Set(roles.filter((role) => ['hod', 'faculty_coordinator'].includes(role.role)).map((role) => role.department_id).filter(Boolean))];
  if (departmentIds.length) return { type: 'department', departmentIds, schoolIds: [], facultyId: null, isSystem: false };
  if (roles.some((role) => role.role === 'faculty')) return { type: 'faculty', departmentIds: [], schoolIds: [], facultyId: user.id, isSystem: false };
  return null;
}

async function requireAnalyticsCycle(req, res, cycleId) {
  const cycle = await requireVisibleCycle(req, res, cycleId, { mode: 'read' });
  if (!cycle) return null;
  const viewerScope = deriveViewerScope(req.user);
  if (!viewerScope) { res.status(403).json({ error: 'your role is not authorized to view analytics' }); return null; }
  // A scoped viewer may only request a cycle that contains people in their
  // permitted scope. This prevents cycle metadata from becoming an
  // organisation-wide directory even when the aggregate itself would be zero.
  if (!viewerScope.isSystem) {
    let membership = supabase.from('cycle_participants').select('id').eq('cycle_id', cycleId).limit(1);
    if (viewerScope.type === 'school') membership = membership.in('school_id', viewerScope.schoolIds);
    else if (viewerScope.type === 'department') membership = membership.in('department_id', viewerScope.departmentIds);
    else membership = membership.eq('user_id', req.user.id);
    const visible = unwrap(await membership);
    if (!visible.length) { res.status(403).json({ error: 'this cycle is outside your analytics scope' }); return null; }
  }
  return { cycle, viewerScope };
}

function rpcScope(cycleId, scope) {
  return { p_cycle_id: cycleId, p_department_ids: scope.departmentIds.length ? scope.departmentIds : null, p_school_ids: scope.schoolIds.length ? scope.schoolIds : null, p_faculty_id: scope.facultyId, p_is_system: scope.isSystem };
}

function csvEscape(value) {
  const rendered = value === null || value === undefined ? '' : String(value);
  return /[\",\r\n]/.test(rendered) ? `\"${rendered.replace(/\"/g, '\"\"')}\"` : rendered;
}

function toCsv(rows, fields = ['record_id', 'student_id', 'full_name', 'roll_number', 'department_id', 'detail', 'occurred_at']) {
  return [fields.join(','), ...rows.map((row) => fields.map((field) => csvEscape(row[field])).join(','))].join('\r\n');
}

// A small dependency-free PDF is intentionally limited to the overview's
// self-describing metric rows. Detailed queues should be exported as CSV so
// they remain useful in spreadsheet tooling.
function toOverviewPdf(cycleName, rows) {
  const escape = (value) => String(value ?? '').replace(/([\\()])/g, '\\$1').replace(/[\r\n]+/g, ' ');
  const lines = [`${cycleName} — analytics overview`, ...rows.map((row) => `${row.metric}: ${row.value} (${row.definition})`)].slice(0, 42);
  const content = ['BT', '/F1 11 Tf', '50 792 Td', ...lines.flatMap((line, index) => [index ? '0 -17 Td' : '', `(${escape(line)}) Tj`].filter(Boolean)), 'ET'].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf, 'utf8')); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

router.get('/overview', requireAuth, requireRole(...ANALYTICS_ROLES), requireCrcsPermission('view_analytics'), async (req, res) => {
  const parsed = cycleQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'cycle_id must be a valid UUID' });
  const context = await requireAnalyticsCycle(req, res, parsed.data.cycle_id);
  if (!context) return;
  const data = unwrap(await supabase.rpc('analytics_cycle_overview', rpcScope(context.cycle.id, context.viewerScope)));
  res.json({ ...data, cycle: context.cycle, viewer_scope: context.viewerScope.type, calculated_at: data.calculated_at ?? new Date().toISOString() });
});

router.get('/drilldown', requireAuth, requireRole(...ANALYTICS_ROLES), requireCrcsPermission('view_analytics'), async (req, res) => {
  const parsed = drilldownQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'cycle_id, supported metric, and an optional limit (1-500) are required' });
  const context = await requireAnalyticsCycle(req, res, parsed.data.cycle_id);
  if (!context) return;
  const data = unwrap(await supabase.rpc('analytics_cycle_drilldown', { ...rpcScope(context.cycle.id, context.viewerScope), p_metric: parsed.data.metric, p_limit: parsed.data.limit }));
  res.json({ ...data, cycle: context.cycle, viewer_scope: context.viewerScope.type });
});

router.get('/export', requireAuth, requireRole(...ANALYTICS_ROLES), requireCrcsPermission('view_analytics'), async (req, res) => {
  const parsed = exportQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'cycle_id, supported view, and format=csv|pdf are required' });
  const context = await requireAnalyticsCycle(req, res, parsed.data.cycle_id);
  if (!context) return;
  const safeName = `${context.cycle.name}-${parsed.data.view}`.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'analytics-export';
  if (parsed.data.view === 'internship_outcomes') {
    if (!OUTCOME_ROLES.some((role) => req.user.roles.some((r) => r.role === role))) return res.status(403).json({ error: 'your role cannot export placement outcomes' });
    if (parsed.data.format === 'pdf') return res.status(400).json({ error: 'PDF export is available for the analytics overview; export placement outcomes as CSV.' });
    const aggregates = await buildOutcomeAggregates(context, { cycle_id: parsed.data.cycle_id });
    const rows = aggregates.departments.map((d) => ({
      school: d.school, program_level: d.program_level ?? '', department: d.department,
      total: d.total, online: d.online, offline: d.offline, paid: d.paid, unpaid: d.unpaid,
      min_stipend: d.min_stipend ?? '', median_stipend: d.median_stipend ?? '', avg_stipend: d.avg_stipend ?? '', max_stipend: d.max_stipend ?? '',
    }));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=\"${safeName}.csv\"`);
    return res.send(toCsv(rows, ['school', 'program_level', 'department', 'total', 'online', 'offline', 'paid', 'unpaid', 'min_stipend', 'median_stipend', 'avg_stipend', 'max_stipend']));
  }
  const isOverview = parsed.data.view === 'overview';
  const data = unwrap(await supabase.rpc(isOverview ? 'analytics_cycle_overview' : 'analytics_cycle_drilldown', isOverview
    ? rpcScope(context.cycle.id, context.viewerScope)
    : { ...rpcScope(context.cycle.id, context.viewerScope), p_metric: parsed.data.view, p_limit: 500 }));
  if (isOverview) {
    const rows = Object.entries(data.metrics ?? {}).map(([metric, value]) => ({ metric, value: value?.value ?? 0, numerator: value?.numerator ?? '', denominator: value?.denominator ?? '', exclusions: (value?.exclusions ?? []).join(' | '), definition: data.definitions?.[metric] ?? '' }));
    if (parsed.data.format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=\"${safeName}.pdf\"`);
      return res.send(toOverviewPdf(context.cycle.name, rows));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=\"${safeName}.csv\"`);
    return res.send(toCsv(rows, ['metric', 'value', 'numerator', 'denominator', 'exclusions', 'definition']));
  }
  if (parsed.data.format === 'pdf') return res.status(400).json({ error: 'PDF export is available for the analytics overview; export a detailed queue as CSV.' });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=\"${safeName}.csv\"`);
  res.send(toCsv(data.rows ?? []));
});

// Department-wise placement outcomes (paid/unpaid, mode, stipend range).
// No 'faculty' role here: this is an HOD-and-up institutional report, not a
// per-mentee view. (internship_outcomes is also read by admin.js's
// /student-records endpoint — Student Records + All People tabs, per explicit
// request — but still never by the student's own profile or a faculty view.)
const OUTCOME_ROLES = ['crcs_superadmin', 'crcs_coordinator', 'dean', 'school_office', 'hod', 'faculty_coordinator'];

function median(sortedNums) {
  if (!sortedNums.length) return null;
  const mid = Math.floor(sortedNums.length / 2);
  return sortedNums.length % 2 ? sortedNums[mid] : (sortedNums[mid - 1] + sortedNums[mid]) / 2;
}

function stipendStats(stipends) {
  const sorted = [...stipends].sort((a, b) => a - b);
  return {
    min_stipend: sorted.length ? sorted[0] : null,
    median_stipend: median(sorted),
    avg_stipend: sorted.length ? Math.round((sorted.reduce((a, b) => a + b, 0) / sorted.length) * 100) / 100 : null,
    max_stipend: sorted.length ? sorted[sorted.length - 1] : null,
  };
}

const outcomeQuery = cycleQuery.extend({
  nature: z.enum(['paid', 'unpaid']).optional(),
  mode: z.enum(['online', 'offline']).optional(),
  program_level: z.enum(['UG', 'PG']).optional(),
  domain_sector: z.string().min(1).optional(),
  company_country: z.string().min(1).optional(),
  source_type: z.enum(['self_internship', 'crcs_opportunity']).optional(),
});

// source_id is polymorphic (self_internships.id or opportunity_applications.id) —
// no FK, so company names are resolved with two lookups instead of an embed.
async function resolveCompanyNames(rows) {
  const selfIds = rows.filter((r) => r.source_type === 'self_internship').map((r) => r.source_id);
  const oppIds = rows.filter((r) => r.source_type === 'crcs_opportunity').map((r) => r.source_id);
  const [selfCompanies, oppCompanies] = await Promise.all([
    selfIds.length ? supabase.from('self_internships').select('id,company_name').in('id', selfIds) : { data: [] },
    oppIds.length ? supabase.from('opportunity_applications').select('id,crcs_opportunities(organization_name)').in('id', oppIds) : { data: [] },
  ]);
  const companyById = new Map();
  for (const rec of unwrap(selfCompanies)) companyById.set(rec.id, rec.company_name);
  for (const rec of unwrap(oppCompanies)) companyById.set(rec.id, rec.crcs_opportunities?.organization_name);
  return companyById;
}

// Middle grouping tier is just the raw UG/PG enum, per explicit request
// (kept simple — not parsed from programme_name). New student creation now
// requires this field (see admin.js createUserSchema), so "Unspecified"
// should only ever appear on legacy pre-existing students going forward.
function levelFromProgramme(programmeName, programLevel) {
  return programLevel || 'Unspecified';
}

function deptLabelFor(programmeName, departmentName) {
  return [programmeName, departmentName].filter(Boolean).join(' - ') || departmentName || 'Unspecified';
}

// Seeds every real school/department/programme this viewer can see, with
// zero stats, independent of whether any outcome/research row exists yet —
// shared by buildOutcomeAggregates (placement outcomes) and
// buildResearchAggregates (research internships) below, since both group by
// the identical School → Level → Programme tree. `newGroup` supplies the
// caller's own zero-stat shape (paid/unpaid/stipends vs project/faculty sets).
async function seedSchoolDeptCatalog(context, newGroup) {
  const { viewerScope } = context;
  let deptQuery = supabase.from('departments').select('id,name,school_id,schools!inner(name,university_id)').eq('schools.university_id', context.cycle.university_id);
  if (viewerScope.type === 'department') deptQuery = deptQuery.in('id', viewerScope.departmentIds);
  else if (viewerScope.type === 'school') deptQuery = deptQuery.in('school_id', viewerScope.schoolIds);
  const departmentRows = unwrap(await deptQuery);
  const departmentById = new Map(departmentRows.map((d) => [d.id, d]));
  const deptIds = departmentRows.map((d) => d.id);

  const deptGroups = new Map();
  const schoolLevelGroups = new Map();
  const schoolGroups = new Map();
  for (const dept of departmentRows) {
    const schoolName = dept.schools?.name ?? 'Unspecified school';
    if (!schoolGroups.has(dept.school_id)) schoolGroups.set(dept.school_id, { school: schoolName, school_id: dept.school_id, ...newGroup() });
  }

  const students = deptIds.length ? unwrap(await supabase.from('students').select('id,department_id,program_level,programme_name').in('department_id', deptIds)) : [];
  const departmentsWithStudents = new Set();
  for (const student of students) {
    const dept = departmentById.get(student.department_id);
    if (!dept) continue;
    departmentsWithStudents.add(student.department_id);
    const level = levelFromProgramme(student.programme_name, student.program_level);
    const deptLabel = deptLabelFor(student.programme_name, dept.name);
    const schoolName = dept.schools?.name ?? 'Unspecified school';
    const deptKey = `${student.department_id}|${level}|${student.programme_name ?? dept.name}`;
    if (!deptGroups.has(deptKey)) deptGroups.set(deptKey, { department: deptLabel, school: schoolName, school_id: dept.school_id, program_level: level, department_id: student.department_id, ...newGroup() });
    const slKey = `${dept.school_id}|${level}`;
    if (!schoolLevelGroups.has(slKey)) schoolLevelGroups.set(slKey, { school: schoolName, school_id: dept.school_id, program_level: level, ...newGroup() });
  }
  // A department with zero enrolled students has no student row to infer a
  // programme/level from — still give it one blank leaf row (keyed by its
  // own name) so it's visible at all, rather than vanishing silently.
  for (const dept of departmentRows) {
    if (departmentsWithStudents.has(dept.id)) continue;
    const schoolName = dept.schools?.name ?? 'Unspecified school';
    deptGroups.set(`${dept.id}|Unspecified|${dept.name}`, { department: dept.name, school: schoolName, school_id: dept.school_id, program_level: 'Unspecified', department_id: dept.id, ...newGroup() });
    const slKey = `${dept.school_id}|Unspecified`;
    if (!schoolLevelGroups.has(slKey)) schoolLevelGroups.set(slKey, { school: schoolName, school_id: dept.school_id, program_level: 'Unspecified', ...newGroup() });
  }

  return { departmentRows, departmentById, deptIds, students, deptGroups, schoolLevelGroups, schoolGroups };
}

// Shared by GET /internship-outcomes and the CSV export — one aggregation
// pass produces the department-level rows, the School/School+Level subtotals
// (the audit sheet's own group-header rows are blank templates; a live page
// can actually sum them, for free, in this same loop), and the company grid.
//
// Schools/departments/programmes are seeded from the real catalog (schools +
// departments + enrolled students) with zero stats FIRST, then outcome rows
// are tallied on top — so a department with zero submitted outcomes still
// shows as a real (blank) row instead of disappearing entirely. The catalog
// pass is intentionally independent of the caller's nature/mode/etc filters:
// filters narrow which outcomes count, not which schools/departments exist.
async function buildOutcomeAggregates(context, filters) {
  const { viewerScope } = context;
  const newGroup = () => ({ total: 0, online: 0, offline: 0, paid: 0, unpaid: 0, stipends: [] });
  const tally = (group, row) => {
    group.total += 1;
    if (row.mode === 'online') group.online += 1;
    if (row.mode === 'offline') group.offline += 1;
    if (row.nature === 'paid') group.paid += 1;
    if (row.nature === 'unpaid') group.unpaid += 1;
    if (row.nature === 'paid' && row.stipend_amount != null) group.stipends.push(Number(row.stipend_amount));
  };
  const finalize = (group) => { const { stipends, ...rest } = group; return { ...rest, ...stipendStats(stipends) }; };

  const { deptGroups, schoolLevelGroups, schoolGroups } = await seedSchoolDeptCatalog(context, newGroup);

  // --- Outcome pass: tally real submissions onto the pre-seeded catalog ---
  let query = supabase.from('internship_outcomes')
    .select('source_type,source_id,mode,nature,stipend_amount,domain_sector,company_country,students!inner(department_id,program_level,programme_name,departments!inner(name,school_id,schools(name)))')
    .eq('cycle_id', filters.cycle_id)
    // Defensive tenant boundary: internship_outcomes.university_id is stored
    // per-row. A cycle's own university_id (not the caller's role) is the
    // scope authority here, matching this codebase's isSameUniversity
    // convention — cross-tenant rows have shown up in this table before
    // (upstream self_internships/opportunity_applications contamination),
    // so a cycle's own report must never surface another university's data
    // even if a source record was mistakenly tagged with this cycle_id.
    .eq('university_id', context.cycle.university_id);
  if (viewerScope.type === 'department') query = query.in('students.department_id', viewerScope.departmentIds);
  else if (viewerScope.type === 'school') query = query.in('students.departments.school_id', viewerScope.schoolIds);
  if (filters.nature) query = query.eq('nature', filters.nature);
  if (filters.mode) query = query.eq('mode', filters.mode);
  if (filters.program_level) query = query.eq('students.program_level', filters.program_level);
  if (filters.domain_sector) query = query.eq('domain_sector', filters.domain_sector);
  if (filters.company_country) query = query.eq('company_country', filters.company_country);
  if (filters.source_type) query = query.eq('source_type', filters.source_type);
  const rows = unwrap(await query);
  const companyById = await resolveCompanyNames(rows);

  const companyGroups = new Map();
  const domains = new Set();
  const countries = new Set();

  for (const row of rows) {
    const dept = row.students?.departments;
    const schoolId = dept?.school_id ?? null;
    const schoolName = dept?.schools?.name ?? 'Unspecified school';
    const level = levelFromProgramme(row.students?.programme_name, row.students?.program_level);
    const deptLabel = deptLabelFor(row.students?.programme_name, dept?.name);
    if (row.domain_sector) domains.add(row.domain_sector);
    if (row.company_country) countries.add(row.company_country);

    // Keyed by real department_id + level + programme_name, not the rendered
    // label: two different departments (different universities/schools) can
    // share the exact same display name, and deduping by text would silently
    // merge their counts into one row (found live: SRM AP's and Test
    // University's "Computer Science and Engineering" are different
    // department_ids). Matches the catalog-pass keys above so a real outcome
    // lands on its pre-seeded (zero-stat) row instead of creating a duplicate.
    const deptKey = `${row.students?.department_id}|${level}|${row.students?.programme_name ?? dept?.name}`;
    if (!deptGroups.has(deptKey)) deptGroups.set(deptKey, { department: deptLabel, school: schoolName, school_id: schoolId, program_level: level, department_id: row.students?.department_id ?? null, ...newGroup() });
    tally(deptGroups.get(deptKey), row);

    const slKey = `${schoolId}|${level}`;
    if (!schoolLevelGroups.has(slKey)) schoolLevelGroups.set(slKey, { school: schoolName, school_id: schoolId, program_level: level, ...newGroup() });
    tally(schoolLevelGroups.get(slKey), row);

    if (!schoolGroups.has(schoolId)) schoolGroups.set(schoolId, { school: schoolName, school_id: schoolId, ...newGroup() });
    tally(schoolGroups.get(schoolId), row);

    const companyLabel = companyById.get(row.source_id) || 'Unspecified';
    if (!companyGroups.has(companyLabel)) companyGroups.set(companyLabel, { company: companyLabel, departments: new Map(), ...newGroup() });
    const cg = companyGroups.get(companyLabel);
    tally(cg, row);
    cg.departments.set(deptLabel, (cg.departments.get(deptLabel) ?? 0) + 1);
  }

  const departments = [...deptGroups.values()].map(finalize).sort((a, b) => a.department.localeCompare(b.department));
  const bySchoolLevel = [...schoolLevelGroups.values()].map(finalize).sort((a, b) => a.school.localeCompare(b.school) || a.program_level.localeCompare(b.program_level));
  const bySchool = [...schoolGroups.values()].map(finalize).sort((a, b) => a.school.localeCompare(b.school));
  const companies = [...companyGroups.values()]
    .map(({ departments: deptMap, ...c }) => ({ ...finalize(c), departments: [...deptMap.entries()].map(([name, count]) => ({ name, count })) }))
    .sort((a, b) => b.total - a.total);

  return { departments, companies, subtotals: { by_school: bySchool, by_school_level: bySchoolLevel }, filter_values: { domains: [...domains].sort(), countries: [...countries].sort() } };
}

router.get('/internship-outcomes', requireAuth, requireRole(...OUTCOME_ROLES), requireCrcsPermission('view_analytics'), async (req, res) => {
  const parsed = outcomeQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'cycle_id must be a valid UUID; nature must be paid|unpaid; mode must be online|offline; program_level must be UG|PG; source_type must be self_internship|crcs_opportunity' });
  const context = await requireAnalyticsCycle(req, res, parsed.data.cycle_id);
  if (!context) return;
  const aggregates = await buildOutcomeAggregates(context, parsed.data);
  res.json({ cycle: context.cycle, viewer_scope: context.viewerScope.type, ...aggregates });
});

const outcomeDetailQuery = cycleQuery.extend({
  department_id: z.string().uuid().optional(),
  school_id: z.string().uuid().optional(),
  company: z.string().min(1).optional(),
  program_level: z.enum(['UG', 'PG']).optional(),
  programme_name: z.string().min(1).optional(),
  nature: z.enum(['paid', 'unpaid']).optional(),
  mode: z.enum(['online', 'offline']).optional(),
  domain_sector: z.string().min(1).optional(),
  company_country: z.string().min(1).optional(),
  source_type: z.enum(['self_internship', 'crcs_opportunity']).optional(),
  q: z.string().min(1).optional(),
}).refine((v) => [v.department_id, v.school_id, v.company].filter(Boolean).length === 1, { message: 'pass exactly one of department_id, school_id, or company' });

// Row-level drill-down behind the department/school table / company cards —
// same precedent as the pre-existing operational-alert drilldowns (which
// already show full_name to CRCS/HOD/Dean), just for internship_outcomes.
router.get('/internship-outcomes/detail', requireAuth, requireRole(...OUTCOME_ROLES), requireCrcsPermission('view_analytics'), async (req, res) => {
  const parsed = outcomeDetailQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'cycle_id is required; pass exactly one of department_id, school_id, or company; other filters are optional' });
  const context = await requireAnalyticsCycle(req, res, parsed.data.cycle_id);
  if (!context) return;
  const { viewerScope } = context;
  const f = parsed.data;

  let query = supabase.from('internship_outcomes')
    .select('source_type,source_id,mode,nature,stipend_amount,duration_months,domain_sector,company_country,recruiter_feedback_doc_id,students!inner(department_id,program_level,programme_name,departments!inner(name,school_id,schools(name)),users!inner(full_name),roll_number)')
    .eq('cycle_id', f.cycle_id)
    .eq('university_id', context.cycle.university_id);
  if (viewerScope.type === 'department') query = query.in('students.department_id', viewerScope.departmentIds);
  else if (viewerScope.type === 'school') query = query.in('students.departments.school_id', viewerScope.schoolIds);
  if (f.department_id) query = query.eq('students.department_id', f.department_id);
  if (f.school_id) query = query.eq('students.departments.school_id', f.school_id);
  if (f.program_level) query = query.eq('students.program_level', f.program_level);
  if (f.programme_name) query = query.eq('students.programme_name', f.programme_name);
  if (f.nature) query = query.eq('nature', f.nature);
  if (f.mode) query = query.eq('mode', f.mode);
  if (f.domain_sector) query = query.eq('domain_sector', f.domain_sector);
  if (f.company_country) query = query.eq('company_country', f.company_country);
  if (f.source_type) query = query.eq('source_type', f.source_type);
  const rows = unwrap(await query);
  const companyById = await resolveCompanyNames(rows);

  const feedbackDocIds = [...new Set(rows.map((r) => r.recruiter_feedback_doc_id).filter(Boolean))];
  const feedbackDocs = feedbackDocIds.length ? unwrap(await supabase.from('documents').select('id,file_name,file_path').in('id', feedbackDocIds)) : [];
  const feedbackById = new Map(await Promise.all(feedbackDocs.map(async (doc) => [doc.id, { file_name: doc.file_name, url: await getSignedUrl(doc.file_path) }])));

  let students = rows
    .map((row) => {
      const dept = row.students?.departments;
      return {
        full_name: row.students?.users?.full_name,
        roll_number: row.students?.roll_number,
        // Same degree-word parsing as the department table above (students.
        // program_level is null for most existing students; programme_name's
        // own prefix is the real, populated signal).
        program_level: levelFromProgramme(row.students?.programme_name, row.students?.program_level),
        programme_name: row.students?.programme_name,
        school: dept?.schools?.name ?? null,
        department: dept?.name ?? null,
        company: companyById.get(row.source_id) || 'Unspecified',
        company_country: row.company_country,
        domain_sector: row.domain_sector,
        mode: row.mode,
        nature: row.nature,
        stipend_amount: row.stipend_amount,
        duration_months: row.duration_months,
        feedback_doc: row.recruiter_feedback_doc_id ? feedbackById.get(row.recruiter_feedback_doc_id) ?? null : null,
      };
    })
    .filter((row) => !f.company || row.company === f.company);
  if (f.q) {
    const needle = f.q.trim().toLowerCase();
    students = students.filter((s) => (s.full_name ?? '').toLowerCase().includes(needle) || (s.roll_number ?? '').toLowerCase().includes(needle));
  }
  students.sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? ''));

  res.json({ cycle: context.cycle, students });
});

// Research internships are deliberately excluded from internship_outcomes
// (no paid/unpaid/stipend concept applies — research has no company/offer at
// all), but "how many students, which departments, which faculty are
// carrying them" is real, already-available data that was never surfaced.
// Same School → Level → Programme tree as placement outcomes, plus a
// faculty-wise capacity table with its own project+student drill-down.
async function buildResearchAggregates(context) {
  const newGroup = () => ({ total: 0, projectIds: new Set(), facultyIds: new Set() });
  const finalize = (group) => { const { projectIds, facultyIds, ...rest } = group; return { ...rest, projects: projectIds.size, faculty: facultyIds.size }; };
  const { departmentById, deptIds, students, deptGroups, schoolLevelGroups, schoolGroups } = await seedSchoolDeptCatalog(context, newGroup);
  const studentById = new Map(students.map((s) => [s.id, s]));

  const raRows = unwrap(await supabase.from('research_applications')
    .select('student_id,project_id,research_projects!inner(cycle_id,faculty_id)')
    .eq('status', 'crcs_approved')
    .eq('research_projects.cycle_id', context.cycle.id));
  for (const row of raRows) {
    const student = studentById.get(row.student_id);
    const dept = student && departmentById.get(student.department_id);
    if (!dept) continue; // outside this viewer's scope
    const level = levelFromProgramme(student.programme_name, student.program_level);
    const deptKey = `${student.department_id}|${level}|${student.programme_name ?? dept.name}`;
    const slKey = `${dept.school_id}|${level}`;
    for (const group of [deptGroups.get(deptKey), schoolLevelGroups.get(slKey), schoolGroups.get(dept.school_id)]) {
      if (!group) continue;
      group.total += 1;
      group.projectIds.add(row.project_id);
      group.facultyIds.add(row.research_projects.faculty_id);
    }
  }

  const departments = [...deptGroups.values()].map(finalize).sort((a, b) => a.department.localeCompare(b.department));
  const bySchoolLevel = [...schoolLevelGroups.values()].map(finalize).sort((a, b) => a.school.localeCompare(b.school) || a.program_level.localeCompare(b.program_level));
  const bySchool = [...schoolGroups.values()].map(finalize).sort((a, b) => a.school.localeCompare(b.school));

  // Faculty capacity table — independent of the school/department tree above.
  const facultyRows = deptIds.length ? unwrap(await supabase.from('faculty').select('id,department_id').in('department_id', deptIds)) : [];
  const facultyIds = facultyRows.map((f) => f.id);
  const [facultyUsers, projects] = await Promise.all([
    facultyIds.length ? supabase.from('users').select('id,full_name').in('id', facultyIds) : { data: [] },
    facultyIds.length ? supabase.from('research_projects').select('id,faculty_id,max_students,approved_count').eq('cycle_id', context.cycle.id).in('faculty_id', facultyIds) : { data: [] },
  ]);
  const facultyNameById = new Map(unwrap(facultyUsers).map((u) => [u.id, u.full_name]));
  const facultyStats = new Map(facultyRows.map((f) => {
    const dept = departmentById.get(f.department_id);
    return [f.id, { faculty_id: f.id, full_name: facultyNameById.get(f.id) ?? 'Unknown', department: dept?.name ?? null, school: dept?.schools?.name ?? null, department_id: f.department_id, project_count: 0, approved_count: 0, max_students: 0 }];
  }));
  for (const project of unwrap(projects)) {
    const stats = facultyStats.get(project.faculty_id);
    if (!stats) continue;
    stats.project_count += 1;
    stats.approved_count += project.approved_count ?? 0;
    stats.max_students += project.max_students ?? 0;
  }
  const faculty = [...facultyStats.values()].filter((f) => f.project_count > 0).sort((a, b) => a.full_name.localeCompare(b.full_name));

  return { departments, subtotals: { by_school: bySchool, by_school_level: bySchoolLevel }, faculty };
}

router.get('/research-outcomes', requireAuth, requireRole(...OUTCOME_ROLES), requireCrcsPermission('view_analytics'), async (req, res) => {
  const parsed = cycleQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'cycle_id must be a valid UUID' });
  const context = await requireAnalyticsCycle(req, res, parsed.data.cycle_id);
  if (!context) return;
  const aggregates = await buildResearchAggregates(context);
  res.json({ cycle: context.cycle, viewer_scope: context.viewerScope.type, ...aggregates });
});

const researchFacultyDetailQuery = cycleQuery.extend({ faculty_id: z.string().uuid() });

// Row-level drill-down behind a faculty capacity row — lists that faculty's
// research projects for this cycle and the crcs_approved students on each.
router.get('/research-outcomes/faculty-detail', requireAuth, requireRole(...OUTCOME_ROLES), requireCrcsPermission('view_analytics'), async (req, res) => {
  const parsed = researchFacultyDetailQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'cycle_id and faculty_id are required' });
  const context = await requireAnalyticsCycle(req, res, parsed.data.cycle_id);
  if (!context) return;
  const { viewerScope } = context;
  const facultyProfile = unwrap(await supabase.from('faculty').select('id,department_id').eq('id', parsed.data.faculty_id).maybeSingle());
  if (!facultyProfile) return res.status(404).json({ error: 'faculty not found' });
  const dept = unwrap(await supabase.from('departments').select('id,school_id,schools!inner(university_id)').eq('id', facultyProfile.department_id).eq('schools.university_id', context.cycle.university_id).maybeSingle());
  if (!dept) return res.status(404).json({ error: 'faculty not found' });
  if (viewerScope.type === 'department' && !viewerScope.departmentIds.includes(dept.id)) return res.status(403).json({ error: 'not scoped to this faculty' });
  if (viewerScope.type === 'school' && !viewerScope.schoolIds.includes(dept.school_id)) return res.status(403).json({ error: 'not scoped to this faculty' });

  const projects = unwrap(await supabase.from('research_projects').select('id,title,max_students,approved_count,status').eq('cycle_id', context.cycle.id).eq('faculty_id', parsed.data.faculty_id));
  const projectIds = projects.map((p) => p.id);
  const applications = projectIds.length ? unwrap(await supabase.from('research_applications').select('project_id,students!inner(roll_number,users!inner(full_name))').in('project_id', projectIds).eq('status', 'crcs_approved')) : [];
  const studentsByProject = new Map();
  for (const app of applications) {
    if (!studentsByProject.has(app.project_id)) studentsByProject.set(app.project_id, []);
    studentsByProject.get(app.project_id).push({ full_name: app.students?.users?.full_name, roll_number: app.students?.roll_number });
  }
  const result = projects.map((project) => ({ ...project, students: (studentsByProject.get(project.id) ?? []).sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? '')) }));
  res.json({ cycle: context.cycle, projects: result });
});

// Compatibility endpoints for deployed clients. New clients must use the
// mandatory-cycle endpoints above; these legacy RPCs are retained safely scoped.
router.get('/department/:department_id', requireAuth, requireRole('hod', 'faculty_coordinator'), async (req, res) => {
  const ownsDept = req.user.roles.some((role) => ['hod', 'faculty_coordinator'].includes(role.role) && role.department_id === req.params.department_id);
  if (!ownsDept) return res.status(403).json({ error: 'not scoped to this department' });
  res.json(unwrap(await supabase.rpc('analytics_department', { p_department_id: req.params.department_id })));
});
router.get('/school/:school_id', requireAuth, requireRole('dean'), async (req, res) => {
  const ownsSchool = req.user.roles.some((role) => role.role === 'dean' && role.school_id === req.params.school_id);
  if (!ownsSchool) return res.status(403).json({ error: 'not scoped to this school' });
  res.json(unwrap(await supabase.rpc('analytics_school', { p_school_id: req.params.school_id })));
});
router.get('/system', requireAuth, requireRole('crcs_superadmin'), async (_req, res) => res.json(unwrap(await supabase.rpc('analytics_system', {}))));

export default router;
