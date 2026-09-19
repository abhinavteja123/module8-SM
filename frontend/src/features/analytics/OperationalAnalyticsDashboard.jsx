import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { WarningCircle, FileArrowDown, FilePdf } from '@phosphor-icons/react';
import { Card } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { EmptyState, PageHeader, StatCard } from '../../components/ui/page.jsx';
import { Dialog } from '../../components/ui/dialog.jsx';
import { useCycle } from '../../cycles/CycleContext.jsx';
import { downloadAnalyticsExport, getAnalyticsDrilldown, getAnalyticsOverview, getInternshipOutcomes, getInternshipOutcomeDetail, getResearchOutcomes, getResearchFacultyDetail } from './analyticsClient.js';

const titleize = (value = '') => String(value).replace(/[_-]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const asArray = (value) => Array.isArray(value) ? value : Object.entries(value ?? {}).map(([key, item]) => ({ key, ...(typeof item === 'object' ? item : { value: item }) }));
const countOf = (value) => Number(value?.count ?? value?.value ?? value?.total ?? value ?? 0);

// Maps overview row/stage keys to the backend's `drilldownMetrics` enum
// (backend/src/routes/analytics.js). Only keys with a real, permission-scoped
// row projection belong here; anything else must stay non-interactive rather
// than fire a request the backend will 400 on. Source of truth for both sides:
// backend/db/migrations/20260909000019_cycle_analytics.sql.
const DRILLDOWN_METRIC_MAP = {
  mentor_capacity_risk: 'capacity_risk',
  overdue_report_deadlines: 'overdue_reports',
  missing_required_acknowledgements: 'missing_acknowledgements',
  pending_unlock_requests: 'pending_unlock_requests',
  unassigned_active_internships: 'unassigned_active_internships',
  duplicate_active_applications: 'duplicate_active_applications',
  missing_cycle_enrolment: 'missing_cycle_enrolment',
  inconsistent_statuses: 'inconsistent_statuses',
  // Both review stages feed the same "awaiting a decision" queue as the
  // pending_reviews alert/metric.
  faculty_review: 'pending_reviews',
  crcs_review: 'pending_reviews',
};

function metricItems(data) {
  const source = data?.kpis ?? data?.metrics ?? data?.summary ?? {};
  const definitions = data?.definitions ?? {};
  const items = Array.isArray(source)
    ? source.map((item) => ({ ...item, key: item.key ?? item.id ?? item.metric }))
    : Object.entries(source).filter(([, value]) => typeof value === 'number' || (value && typeof value === 'object')).map(([key, value]) => ({ key, ...(typeof value === 'object' ? value : { value }) }));
  // The backend sends real per-metric prose under a top-level `definitions`
  // map keyed by the same metric key, not nested on the metric itself — wire
  // it in here instead of falling back to a canned placeholder.
  return items.map((item) => ({ ...item, definition: item.definition ?? definitions[item.key] ?? FALLBACK_DEFINITIONS[item.key] }));
}

// Backend doesn't yet publish a `definitions` entry for these keys (only
// approval_rate/active_internships/completed_internships have one) — real,
// specific sentences here instead of a generic "not available" placeholder.
const FALLBACK_DEFINITIONS = {
  enrolled_students: 'Active directory users enrolled as students in this cycle.',
  selected_students: 'Enrolled students who have chosen a research, CRCS opportunity, or self-internship track.',
  applications_submitted: 'Every application ever submitted in this cycle, including later rejected or revoked ones.',
  average_crcs_decision_hours: 'Average time between an application reaching CRCS and CRCS deciding it.',
  average_faculty_review_hours: 'Average time a faculty mentor takes to review a research application. CRCS opportunities have no faculty review stage.',
};

const PERCENT_KEYS = new Set(['approval_rate']);
const HOUR_KEYS = new Set(['average_crcs_decision_hours', 'average_faculty_review_hours']);

// Groups the flat KPI list into rows by unit family instead of one
// undifferentiated grid — counts, a rate, and durations don't compare to
// each other and reading them side by side as four equal tiles was the
// core "not professional" complaint.
const METRIC_GROUPS = [
  { title: 'Enrollment & applications', keys: ['enrolled_students', 'selected_students', 'applications_submitted'] },
  { title: 'Approvals & outcomes', keys: ['active_internships', 'completed_internships'] },
];

// Not useful per direct feedback: approval_rate's math is easy to misread,
// and the turnaround-hours pair mostly reads "—" (average_faculty_review_hours
// can go negative, a pre-existing backend bug — see formatMetricValue).
const DROPPED_METRIC_KEYS = new Set(['approval_rate', 'average_crcs_decision_hours', 'average_faculty_review_hours']);

function formatMetricValue(key, metric) {
  const raw = metric.display_value ?? metric.value ?? metric.count ?? 0;
  if (typeof raw !== 'number') return raw;
  // average_faculty_review_hours can currently come back negative from the
  // backend RPC (a real backend bug, out of scope here) — never print a
  // negative duration, that's never a legitimate value.
  if (HOUR_KEYS.has(key)) return raw < 0 ? '—' : `${raw.toFixed(1)} hrs`;
  if (PERCENT_KEYS.has(key)) return `${raw.toFixed(1)}%`;
  return Math.round(raw).toLocaleString();
}

// Backend sends `exclusions` as an array of full sentences, not a short
// label — the old code appended the literal word " excluded" after an
// already-complete sentence ("...denominator. excluded").
function exclusionText(exclusions) {
  if (!exclusions) return '';
  return (Array.isArray(exclusions) ? exclusions : [exclusions]).filter(Boolean).join(' ');
}

function MetricCard({ metric }) {
  const label = metric.label ?? titleize(metric.key);
  const value = formatMetricValue(metric.key, metric);
  // A numerator/denominator caption only makes sense for a real ratio: both
  // must be numbers and the numerator can't exceed the denominator (a count
  // like applications_submitted=684 paired with an unrelated denominator=4
  // is a backend field-shape quirk for that metric, not a ratio to display).
  const hasRatio = typeof metric.numerator === 'number' && typeof metric.denominator === 'number' && metric.numerator <= metric.denominator;
  const exclusions = exclusionText(metric.exclusions);
  // ponytail: none of the overview KPI keys (enrolled_students, approval_rate,
  // …) are in the backend's row-level drilldown enum, so these cards stay
  // read-only instead of opening a dialog that would always 400.
  return <div className="portal-card h-full p-5"><p className="text-sm font-semibold text-slate-700">{label}</p><p className="mt-1 text-3xl font-bold tracking-tight text-slate-950">{value}</p>{hasRatio && <p className="mt-2 text-xs text-slate-500">{metric.numerator} of {metric.denominator}{exclusions ? ` · ${exclusions}` : ''}</p>}{metric.definition && <p className="mt-3 text-xs leading-5 text-slate-600">{metric.definition}</p>}</div>;
}

function SectionCard({ title, description, children }) {
  return <Card className="p-5"><h2 className="font-bold text-slate-950">{title}</h2>{description && <p className="mt-1 text-sm leading-5 text-slate-600">{description}</p>}<div className="mt-4">{children}</div></Card>;
}

function RowList({ rows, empty, onDrilldown }) {
  if (!rows.length) return <p className="text-sm text-slate-500">{empty}</p>;
  return <div className="space-y-2">{rows.map((row, index) => {
    const key = row.key ?? row.id ?? row.status ?? row.label ?? `row-${index}`;
    const label = row.label ?? row.name ?? row.status ?? titleize(key);
    const metric = row.metric ?? DRILLDOWN_METRIC_MAP[key];
    const content = <><span className="text-slate-700">{label}{row.detail ? <span className="ml-2 text-xs text-slate-500">{row.detail}</span> : null}</span><span className="font-bold text-slate-950">{countOf(row)}</span></>;
    if (!metric) return <div key={key} className="flex w-full items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">{content}</div>;
    return <button key={key} type="button" onClick={() => onDrilldown(metric, label)} className="flex w-full items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-left text-sm hover:bg-indigo-50">{content}</button>;
  })}</div>;
}

function Funnel({ stages, onDrilldown }) {
  const rows = asArray(stages).map((stage, index) => ({ ...stage, key: stage.key ?? stage.id ?? `stage-${index}` }));
  if (!rows.length) return <p className="text-sm text-slate-500">Funnel data will appear once applications enter this cycle.</p>;
  const max = Math.max(...rows.map(countOf), 1);
  return <div className="space-y-3">{rows.map((stage) => {
    const count = countOf(stage);
    const metric = stage.metric ?? DRILLDOWN_METRIC_MAP[stage.key];
    const body = <><div className="flex justify-between gap-4 text-sm"><span className="font-medium text-slate-800">{stage.label ?? titleize(stage.key)}</span><span className="font-bold text-slate-950">{count}{stage.sla_duration ?? stage.duration ? <span className="ml-2 text-xs font-medium text-slate-500">{stage.sla_duration ?? stage.duration}</span> : null}</span></div><div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-600" style={{ width: `${Math.max(4, (count / max) * 100)}%` }} /></div>{stage.drop_off !== undefined && <p className="mt-1 text-xs text-slate-500">Drop-off: {stage.drop_off}</p>}</>;
    if (!metric) return <div key={stage.key} className="w-full">{body}</div>;
    return <button type="button" key={stage.key} onClick={() => onDrilldown(metric, stage.label ?? titleize(stage.key))} className="w-full text-left">{body}</button>;
  })}</div>;
}

function AlertList({ alerts, onDrilldown }) {
  // severity 'ok' means the threshold isn't breached — those aren't alerts,
  // they're a status check, and used to render identically to a real warning
  // (no 'ok' case in `styles{}` below) even on a fully healthy cycle.
  const rows = asArray(alerts).filter((alert) => alert.severity !== 'ok');
  if (!rows.length) return <p className="text-sm text-emerald-700">No operational thresholds are currently breached.</p>;
  const styles = { critical: 'border-red-200 bg-red-50', high: 'border-amber-200 bg-amber-50', warning: 'border-amber-200 bg-amber-50' };
  return <div className="space-y-2">{rows.map((alert, index) => <button key={alert.id ?? alert.key ?? index} type="button" onClick={() => onDrilldown(alert.metric ?? alert.key ?? 'alerts', alert.title ?? alert.label ?? titleize(alert.key))} className={`w-full rounded-xl border p-3 text-left transition hover:brightness-95 ${styles[alert.severity] ?? 'border-brand-200 bg-brand-50'}`}><div className="flex items-start justify-between gap-3"><span className="flex items-center gap-1.5 font-semibold text-ink"><WarningCircle size={15} weight="bold" className="shrink-0 text-current opacity-70" />{alert.title ?? alert.label ?? titleize(alert.key)}</span><span className="text-sm font-bold text-ink">{alert.count ?? ''}</span></div><p className="mt-1 pl-[1.6rem] text-sm text-slate-700">{alert.description ?? alert.message ?? 'Review the affected records.'}</p></button>)}</div>;
}

function DrilldownDialog({ cycleId, metric, label, onClose }) {
  const { data, isLoading, error } = useQuery({ queryKey: ['analytics-drilldown', cycleId, metric], queryFn: () => getAnalyticsDrilldown(cycleId, metric), enabled: !!cycleId && !!metric });
  const rows = data?.records ?? data?.items ?? data?.rows ?? (Array.isArray(data) ? data : []);
  // record_id/department_id are raw UUIDs with no display value — department_name
  // (joined server-side) and full_name already carry what a viewer needs.
  const HIDDEN_FIELDS = new Set(['record_id', 'department_id']);
  const fields = rows[0] ? Object.keys(rows[0]).filter((key) => typeof rows[0][key] !== 'object' && !HIDDEN_FIELDS.has(key)) : [];
  return (
    <Dialog open onClose={onClose} size="xl" title={label}>
      <p className="-mt-3 mb-5 text-xs font-bold uppercase tracking-widest text-brand-600">Permission-scoped drill-down</p>
      {isLoading ? <p className="text-sm text-slate-500">Loading records…</p> : error ? <p className="text-sm text-red-700">{error.message}</p> : !rows.length ? (
        <p className="text-sm text-slate-500">No records match this metric and filter.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-grid">
            <thead><tr>{fields.map((key) => <th key={key}>{titleize(key)}</th>)}</tr></thead>
            <tbody>{rows.map((row, index) => <tr key={row.id ?? index}>{fields.map((key) => <td key={key} className="max-w-56 truncate">{String(row[key] ?? '—')}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
    </Dialog>
  );
}

// Renders the 9 shared numeric columns (Total/Online/Offline/Paid/Unpaid/
// Min/Median/Avg/Max stipend) for a school, school+level, or department row —
// one cell layout for all three grouping tiers.
function StatCells({ row }) {
  return <>
    <td className="px-3 py-2 text-right">{row?.total ?? 0}</td>
    <td className="px-3 py-2 text-right">{row?.online ?? 0}</td>
    <td className="px-3 py-2 text-right">{row?.offline ?? 0}</td>
    <td className="px-3 py-2 text-right">{row?.paid ?? 0}</td>
    <td className="px-3 py-2 text-right">{row?.unpaid ?? 0}</td>
    <td className="px-3 py-2 text-right">{row?.min_stipend ?? '—'}</td>
    <td className="px-3 py-2 text-right">{row?.median_stipend ?? '—'}</td>
    <td className="px-3 py-2 text-right">{row?.avg_stipend ?? '—'}</td>
    <td className="py-2 pl-3 text-right">{row?.max_stipend ?? '—'}</td>
  </>;
}

// Reshapes the backend's flat `departments` + `subtotals` arrays into a
// School → Level → Programme tree for rendering — the audit workbook's own
// grouping, computed server-side in the same aggregation pass.
function groupOutcomeRows(departments = [], subtotals = {}) {
  const bySchool = new Map();
  for (const dept of departments) {
    if (!bySchool.has(dept.school)) bySchool.set(dept.school, new Map());
    const levels = bySchool.get(dept.school);
    const levelKey = dept.program_level ?? 'Unspecified';
    if (!levels.has(levelKey)) levels.set(levelKey, []);
    levels.get(levelKey).push(dept);
  }
  const schoolStats = new Map((subtotals.by_school ?? []).map((s) => [s.school, s]));
  const levelStats = new Map((subtotals.by_school_level ?? []).map((s) => [`${s.school}|${s.program_level}`, s]));
  // A school whose every department currently has zero enrolled students
  // (e.g. a newly added school) won't appear in `departments` at all — seed
  // it here (with an empty level list) so it still renders as a blank row.
  for (const s of subtotals.by_school ?? []) if (!bySchool.has(s.school)) bySchool.set(s.school, new Map());
  return [...bySchool.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([school, levels]) => ({
    school,
    schoolId: schoolStats.get(school)?.school_id ?? null,
    stats: schoolStats.get(school),
    levels: [...levels.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([level, rows]) => ({
      level,
      stats: levelStats.get(`${school}|${level}`),
      rows: [...rows].sort((a, b) => a.department.localeCompare(b.department)),
    })),
  }));
}

// Student-level drill-down behind a school/level/department row or a company
// card — same "permission-scoped drill-down" precedent as DrilldownDialog
// above, backed by GET /analytics/internship-outcomes/detail. Columns mirror
// the audit workbook's own "Summer Internship" sheet column order.
function OutcomeStudentsDialog({ cycleId, departmentId, schoolId, company, label, onClose }) {
  const [search, setSearch] = useState('');
  const { data, isLoading, error } = useQuery({
    queryKey: ['analytics-outcome-detail', cycleId, departmentId, schoolId, company],
    // Note: departmentId/schoolId/company are real IDs/exact names — precise.
    // A "level" (B.Tech/M.Tech/...) row spans several programme_name values,
    // which the detail endpoint has no single filter for, so a level-row
    // click below intentionally scopes to the whole school instead.
    queryFn: () => getInternshipOutcomeDetail(cycleId, { departmentId, schoolId, company }),
    enabled: !!cycleId && (!!departmentId || !!schoolId || !!company),
  });
  const needle = search.trim().toLowerCase();
  const students = (data?.students ?? []).filter((student) => !needle || (student.full_name ?? '').toLowerCase().includes(needle) || (student.roll_number ?? '').toLowerCase().includes(needle));
  return (
    <Dialog open onClose={onClose} size="full" title={label}>
      <p className="-mt-3 mb-3 text-xs font-bold uppercase tracking-widest text-brand-600">Permission-scoped drill-down</p>
      <input type="text" placeholder="Search by name or roll number…" value={search} onChange={(event) => setSearch(event.target.value)} className="mb-4 w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      {isLoading ? <p className="text-sm text-slate-500">Loading students…</p> : error ? <p className="text-sm text-red-700">{error.message}</p> : !students.length ? (
        <p className="text-sm text-slate-500">No students match.</p>
      ) : (
        <table className="data-grid w-full">
          <thead><tr><th>Roll No.</th><th>Name</th><th>Level</th><th>Programme</th><th>School</th><th>Company</th><th>Country</th><th>Domain/Sector</th><th>Mode</th><th>Duration</th><th>Nature</th><th>Stipend</th></tr></thead>
          <tbody>{students.map((student, index) => (
            <tr key={student.roll_number ?? index}>
              <td>{student.roll_number ?? '—'}</td>
              <td>{student.full_name ?? '—'}</td>
              <td>{student.program_level ?? '—'}</td>
              <td>{student.programme_name ?? '—'}</td>
              <td>{student.school ?? '—'}</td>
              <td>{student.company ?? '—'}</td>
              <td>{student.company_country ?? '—'}</td>
              <td>{student.domain_sector ?? '—'}</td>
              <td className="capitalize">{student.mode ?? '—'}</td>
              <td>{student.duration_months != null ? `${student.duration_months} mo` : '—'}</td>
              <td className="capitalize">{student.nature ?? '—'}</td>
              <td>{student.nature === 'paid' && student.stipend_amount != null ? `₹${student.stipend_amount}/mo` : '—'}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </Dialog>
  );
}

// The audit-shaped placement-outcomes report — its own tab, own filter bar,
// own export, independent of the operational KPIs above.
function PlacementOutcomesSection({ cycleId }) {
  const [filters, setFilters] = useState({ nature: '', mode: '', domain_sector: '', company_country: '', source_type: '' });
  const [companySearch, setCompanySearch] = useState('');
  const [showAllCompanies, setShowAllCompanies] = useState(false);
  const [outcomeDetail, setOutcomeDetail] = useState(null);
  const [exportError, setExportError] = useState('');
  // 403s for a plain faculty caller (this endpoint is HOD-and-up only, see
  // backend/src/routes/analytics.js) — retry:false, handled below.
  const outcomes = useQuery({ queryKey: ['analytics-internship-outcomes', cycleId, filters], queryFn: () => getInternshipOutcomes(cycleId, filters), enabled: !!cycleId, retry: false });
  const setFilter = (key) => (event) => setFilters((current) => ({ ...current, [key]: event.target.value }));
  const grouped = useMemo(() => groupOutcomeRows(outcomes.data?.departments, outcomes.data?.subtotals), [outcomes.data]);
  const domainOptions = outcomes.data?.filter_values?.domains ?? [];
  const countryOptions = outcomes.data?.filter_values?.countries ?? [];
  const allCompanies = outcomes.data?.companies ?? [];
  const companyNeedle = companySearch.trim().toLowerCase();
  const filteredCompanies = allCompanies.filter((company) => !companyNeedle || company.company.toLowerCase().includes(companyNeedle));
  const visibleCompanies = showAllCompanies || companyNeedle ? filteredCompanies : filteredCompanies.slice(0, 20);
  const exportOutcomes = async () => { setExportError(''); try { await downloadAnalyticsExport(cycleId, 'internship_outcomes', 'csv'); } catch (error) { setExportError(error.message); } };

  if (outcomes.isLoading) return <p className="text-sm text-slate-500">Loading placement outcomes…</p>;
  if (outcomes.error) return <EmptyState title="Placement outcomes aren't available for your role" description="This report is visible to HOD and above." />;
  if (!outcomes.data?.departments?.length) return <EmptyState title="No placement outcomes yet" description="Outcomes are submitted by students after CRCS approval or self-internship completion." />;

  return <div>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-3">
        <label className="text-sm font-medium text-slate-700">Nature <select className="ml-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" value={filters.nature} onChange={setFilter('nature')}><option value="">All</option><option value="paid">Paid</option><option value="unpaid">Unpaid</option></select></label>
        <label className="text-sm font-medium text-slate-700">Mode <select className="ml-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" value={filters.mode} onChange={setFilter('mode')}><option value="">All</option><option value="online">Online</option><option value="offline">Offline</option></select></label>
        <label className="text-sm font-medium text-slate-700">Pathway <select className="ml-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" value={filters.source_type} onChange={setFilter('source_type')}><option value="">All</option><option value="self_internship">Self-internship</option><option value="crcs_opportunity">CRCS opportunity</option></select></label>
        {domainOptions.length > 0 && <label className="text-sm font-medium text-slate-700">Domain/Sector <select className="ml-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" value={filters.domain_sector} onChange={setFilter('domain_sector')}><option value="">All</option>{domainOptions.map((domain) => <option key={domain} value={domain}>{domain}</option>)}</select></label>}
        {countryOptions.length > 0 && <label className="text-sm font-medium text-slate-700">Company country <select className="ml-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" value={filters.company_country} onChange={setFilter('company_country')}><option value="">All</option>{countryOptions.map((country) => <option key={country} value={country}>{country}</option>)}</select></label>}
      </div>
      <Button variant="secondary" onClick={exportOutcomes}><FileArrowDown size={16} weight="bold" />Export CSV</Button>
    </div>
    {exportError && <p className="mb-4 text-sm text-red-700">{exportError}</p>}

    <SectionCard title="Placement outcomes by school / level / programme" description="Click any row to see the students behind it. Stipend figures are ₹ per month.">
      <div className="overflow-x-auto"><table className="min-w-[980px] text-sm"><thead><tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><th className="min-w-[260px] py-2 pr-3">School / Level / Programme</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-right">Online</th><th className="px-3 py-2 text-right">Offline</th><th className="px-3 py-2 text-right">Paid</th><th className="px-3 py-2 text-right">Unpaid</th><th className="px-3 py-2 text-right">Min ₹/mo</th><th className="px-3 py-2 text-right">Median ₹/mo</th><th className="px-3 py-2 text-right">Avg ₹/mo</th><th className="py-2 pl-3 text-right">Max ₹/mo</th></tr></thead>
      <tbody>{grouped.map((schoolGroup) => <Fragment key={schoolGroup.school}>
        <tr className="cursor-pointer border-b border-slate-200 bg-slate-100 font-bold text-slate-900 hover:bg-indigo-50" onClick={() => setOutcomeDetail({ schoolId: schoolGroup.schoolId, label: schoolGroup.school })}>
          <td className="py-2 pr-3">{schoolGroup.school}</td>
          <StatCells row={schoolGroup.stats} />
        </tr>
        {schoolGroup.levels.map((levelGroup) => <Fragment key={levelGroup.level}>
          <tr className="cursor-pointer border-b border-slate-100 bg-slate-50 font-semibold text-slate-800 hover:bg-indigo-50" onClick={() => setOutcomeDetail({ schoolId: schoolGroup.schoolId, label: `${schoolGroup.school} · ${levelGroup.level}` })}>
            <td className="py-2 pl-6 pr-3">{levelGroup.level}</td>
            <StatCells row={levelGroup.stats} />
          </tr>
          {levelGroup.rows.map((dept) => <tr key={dept.department} className="cursor-pointer border-b border-slate-100 hover:bg-indigo-50" onClick={() => setOutcomeDetail({ departmentId: dept.department_id, label: dept.department })}>
            <td className="py-2 pl-10 pr-3 text-slate-700">{dept.department}</td>
            <StatCells row={dept} />
          </tr>)}
        </Fragment>)}
      </Fragment>)}</tbody>
      </table></div>
    </SectionCard>

    {allCompanies.length > 0 && <div className="mt-4"><SectionCard title={`Companies (${allCompanies.length})`} description="Every company students entered while submitting an outcome. Click a row to see the students behind it.">
      <input type="text" placeholder="Search companies…" value={companySearch} onChange={(event) => setCompanySearch(event.target.value)} className="mb-4 w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <div className="overflow-x-auto"><table className="min-w-[820px] w-full text-sm"><thead><tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><th className="min-w-[200px] py-2 pr-3">Company</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-right">Paid</th><th className="px-3 py-2 text-right">Unpaid</th><th className="px-3 py-2 text-right">Avg ₹/mo</th><th className="py-2 pl-3">Departments</th></tr></thead>
      <tbody>{visibleCompanies.map((company) => (
        <tr key={company.company} onClick={() => setOutcomeDetail({ company: company.company, label: company.company })} className="cursor-pointer border-b border-slate-100 hover:bg-indigo-50">
          <td className="py-2 pr-3 font-medium text-slate-900">{company.company}</td>
          <td className="px-3 py-2 text-right">{company.total}</td>
          <td className="px-3 py-2 text-right">{company.paid}</td>
          <td className="px-3 py-2 text-right">{company.unpaid}</td>
          <td className="px-3 py-2 text-right">{company.avg_stipend ?? '—'}</td>
          <td className="py-2 pl-3 text-slate-600">{company.departments.map((d) => d.name).join(', ')}</td>
        </tr>
      ))}</tbody>
      </table></div>
      {!showAllCompanies && !companyNeedle && filteredCompanies.length > 20 && <button type="button" onClick={() => setShowAllCompanies(true)} className="mt-4 text-sm font-bold text-brand-700 hover:underline">Show all {filteredCompanies.length} companies</button>}
    </SectionCard></div>}

    {outcomeDetail && <OutcomeStudentsDialog cycleId={cycleId} departmentId={outcomeDetail.departmentId} schoolId={outcomeDetail.schoolId} company={outcomeDetail.company} label={outcomeDetail.label} onClose={() => setOutcomeDetail(null)} />}
  </div>;
}

// Read-only stat cells for the research table (Students/Projects/Faculty) —
// research has no paid/unpaid/mode/stipend concept, so it's a lighter column
// set than StatCells above, not a reuse of it.
function ResearchStatCells({ row }) {
  return <>
    <td className="px-3 py-2 text-right">{row?.total ?? 0}</td>
    <td className="px-3 py-2 text-right">{row?.projects ?? 0}</td>
    <td className="py-2 pl-3 text-right">{row?.faculty ?? 0}</td>
  </>;
}

// Behind a faculty row in the research capacity table — that faculty's
// projects this cycle, each with its crcs_approved students nested under it.
function ResearchFacultyDetailDialog({ cycleId, facultyId, label, onClose }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['analytics-research-faculty-detail', cycleId, facultyId],
    queryFn: () => getResearchFacultyDetail(cycleId, facultyId),
    enabled: !!cycleId && !!facultyId,
  });
  const projects = data?.projects ?? [];
  return (
    <Dialog open onClose={onClose} size="xxl" title={label}>
      <p className="-mt-3 mb-4 text-xs font-bold uppercase tracking-widest text-brand-600">Permission-scoped drill-down</p>
      {isLoading ? <p className="text-sm text-slate-500">Loading projects…</p> : error ? <p className="text-sm text-red-700">{error.message}</p> : !projects.length ? (
        <p className="text-sm text-slate-500">No research projects in this cycle.</p>
      ) : (
        <div className="space-y-5">
          {projects.map((project) => (
            <div key={project.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-slate-900">{project.title}</p>
                <span className="text-sm font-medium text-slate-600">{project.approved_count}/{project.max_students} students · {project.status}</span>
              </div>
              {project.students.length ? (
                <table className="data-grid mt-3 w-full">
                  <thead><tr><th>Name</th><th>Roll No.</th></tr></thead>
                  <tbody>{project.students.map((student, index) => <tr key={student.roll_number ?? index}><td>{student.full_name ?? '—'}</td><td>{student.roll_number ?? '—'}</td></tr>)}</tbody>
                </table>
              ) : <p className="mt-3 text-sm text-slate-500">No approved students yet.</p>}
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}

// Research is excluded from internship_outcomes by design (no paid/unpaid/
// stipend concept), but school/department counts and faculty capacity are
// real, already-available data — its own tab, reusing the same
// School→Level→Programme tree shape as the Outcomes tab.
function ResearchOutcomesSection({ cycleId }) {
  const [facultySearch, setFacultySearch] = useState('');
  const [facultyDetail, setFacultyDetail] = useState(null);
  const research = useQuery({ queryKey: ['analytics-research-outcomes', cycleId], queryFn: () => getResearchOutcomes(cycleId), enabled: !!cycleId, retry: false });
  const grouped = useMemo(() => groupOutcomeRows(research.data?.departments, research.data?.subtotals), [research.data]);
  const allFaculty = research.data?.faculty ?? [];
  const facultyNeedle = facultySearch.trim().toLowerCase();
  const filteredFaculty = allFaculty.filter((faculty) => !facultyNeedle || faculty.full_name.toLowerCase().includes(facultyNeedle));

  if (research.isLoading) return <p className="text-sm text-slate-500">Loading research internships…</p>;
  if (research.error) return <EmptyState title="Research internship data isn't available for your role" description="This report is visible to HOD and above." />;
  if (!research.data?.departments?.length && !allFaculty.length) return <EmptyState title="No research internships yet" description="Research projects and approved applications for this cycle will appear here." />;

  return <div>
    <SectionCard title="Research internships by school / level / programme" description="CRCS-approved research applications, grouped the same way as placement outcomes. Research has no paid/unpaid or stipend concept.">
      <div className="overflow-x-auto"><table className="min-w-[640px] text-sm"><thead><tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><th className="min-w-[260px] py-2 pr-3">School / Level / Programme</th><th className="px-3 py-2 text-right">Students</th><th className="px-3 py-2 text-right">Projects</th><th className="py-2 pl-3 text-right">Faculty</th></tr></thead>
      <tbody>{grouped.map((schoolGroup) => <Fragment key={schoolGroup.school}>
        <tr className="border-b border-slate-200 bg-slate-100 font-bold text-slate-900">
          <td className="py-2 pr-3">{schoolGroup.school}</td>
          <ResearchStatCells row={schoolGroup.stats} />
        </tr>
        {schoolGroup.levels.map((levelGroup) => <Fragment key={levelGroup.level}>
          <tr className="border-b border-slate-100 bg-slate-50 font-semibold text-slate-800">
            <td className="py-2 pl-6 pr-3">{levelGroup.level}</td>
            <ResearchStatCells row={levelGroup.stats} />
          </tr>
          {levelGroup.rows.map((dept) => <tr key={dept.department} className="border-b border-slate-100">
            <td className="py-2 pl-10 pr-3 text-slate-700">{dept.department}</td>
            <ResearchStatCells row={dept} />
          </tr>)}
        </Fragment>)}
      </Fragment>)}</tbody>
      </table></div>
    </SectionCard>

    {allFaculty.length > 0 && <div className="mt-4"><SectionCard title={`Faculty research capacity (${allFaculty.length})`} description="Click a row to see that faculty's projects and approved students.">
      <input type="text" placeholder="Search faculty…" value={facultySearch} onChange={(event) => setFacultySearch(event.target.value)} className="mb-4 w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <div className="overflow-x-auto"><table className="min-w-[720px] w-full text-sm"><thead><tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><th className="min-w-[200px] py-2 pr-3">Faculty</th><th className="py-2 px-3">Department</th><th className="px-3 py-2 text-right">Projects</th><th className="py-2 pl-3 text-right">Students</th></tr></thead>
      <tbody>{filteredFaculty.map((faculty) => (
        <tr key={faculty.faculty_id} onClick={() => setFacultyDetail({ facultyId: faculty.faculty_id, label: faculty.full_name })} className="cursor-pointer border-b border-slate-100 hover:bg-indigo-50">
          <td className="py-2 pr-3 font-medium text-slate-900">{faculty.full_name}</td>
          <td className="py-2 px-3 text-slate-600">{faculty.department ?? '—'}</td>
          <td className="px-3 py-2 text-right">{faculty.project_count}</td>
          <td className="py-2 pl-3 text-right">{faculty.approved_count}/{faculty.max_students}</td>
        </tr>
      ))}</tbody>
      </table></div>
    </SectionCard></div>}

    {facultyDetail && <ResearchFacultyDetailDialog cycleId={cycleId} facultyId={facultyDetail.facultyId} label={facultyDetail.label} onClose={() => setFacultyDetail(null)} />}
  </div>;
}

const SECTIONS = [['operations', 'Operational health'], ['outcomes', 'Placement outcomes'], ['research', 'Research internships']];

export function OperationalAnalyticsDashboard({ eyebrow, title, description }) {
  const { selectedCycle, selectedCycleId, isLoading: cyclesLoading } = useCycle();
  const [searchParams, setSearchParams] = useSearchParams();
  const [drilldown, setDrilldown] = useState(null);
  const [exportError, setExportError] = useState('');
  const rawSection = searchParams.get('section');
  const section = ['outcomes', 'research'].includes(rawSection) ? rawSection : 'operations';
  const setSection = (next) => { const params = new URLSearchParams(searchParams); if (next === 'operations') params.delete('section'); else params.set('section', next); setSearchParams(params, { replace: true }); };
  const overview = useQuery({ queryKey: ['analytics-overview', selectedCycleId], queryFn: () => getAnalyticsOverview(selectedCycleId), enabled: !!selectedCycleId, staleTime: 30_000 });
  const data = overview.data;
  const metrics = metricItems(data).filter((metric) => !DROPPED_METRIC_KEYS.has(metric.key));
  const groupedMetricKeys = useMemo(() => new Set(METRIC_GROUPS.flatMap((group) => group.keys)), []);
  const ungroupedMetrics = metrics.filter((metric) => !groupedMetricKeys.has(metric.key));
  const funnel = data?.funnel?.stages ?? data?.funnel ?? data?.application_funnel;
  const workload = data?.workload ?? data?.capacity ?? {};
  const compliance = data?.compliance ?? {};
  const quality = data?.data_quality ?? data?.quality ?? {};
  const alerts = data?.alerts ?? data?.operational_alerts ?? [];
  const freshness = data?.calculated_at ?? data?.last_updated ?? data?.freshness?.calculated_at;
  const openDrilldown = (metric, label) => setDrilldown({ metric, label });
  const exportOverview = async (format) => { setExportError(''); try { await downloadAnalyticsExport(selectedCycleId, 'overview', format); } catch (error) { setExportError(error.message); } };
  if (cyclesLoading || overview.isLoading) return <p className="text-sm text-slate-500">Preparing the selected cycle’s analytics…</p>;
  if (!selectedCycleId) return <EmptyState title="Choose an internship cycle" description="Analytics are only calculated for one cycle at a time." />;
  if (overview.error) return <EmptyState title="We couldn’t load this analytics view" description={overview.error.message || 'Please refresh the page. If the problem continues, contact the portal administrator.'} />;
  if (!data) return <EmptyState title="No analytics yet" description="This overview will fill in as work is completed in the selected cycle." />;
  return <div><PageHeader eyebrow={eyebrow ?? `Analytics · ${selectedCycle?.name ?? 'Selected cycle'}`} title={title ?? 'Operational intelligence'} description={description ?? 'Use trusted, cycle-specific metrics to intervene before work falls behind.'} action={section === 'operations' ? <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => exportOverview('pdf')}><FilePdf size={16} weight="bold" />Export PDF</Button><Button onClick={() => exportOverview('csv')}><FileArrowDown size={16} weight="bold" />Export CSV</Button></div> : null} />
    {exportError && <p className="-mt-4 mb-5 text-sm text-red-700">{exportError}</p>}
    <Card className="mb-6 border-indigo-100 bg-indigo-50 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold text-indigo-950">Trusted metric context</p><p className="mt-1 text-sm text-indigo-900">Cycle: {selectedCycle?.name ?? selectedCycleId} · Scope: {data.viewer_scope?.label ?? data.viewer_scope ?? 'Your permitted records'} · Definitions, exclusions, and drill-downs are shown on each KPI.</p></div><p className="text-xs font-medium text-indigo-800">Last calculated: {freshness ? new Date(freshness).toLocaleString() : 'Not supplied'}</p></div></Card>
    <div className="portal-tabbar">{SECTIONS.map(([id, label]) => <button key={id} type="button" onClick={() => setSection(id)} className={`portal-tab ${section === id ? 'portal-tab-active' : 'border-transparent'}`}>{label}</button>)}</div>
    {section === 'outcomes' ? <PlacementOutcomesSection cycleId={selectedCycleId} /> : section === 'research' ? <ResearchOutcomesSection cycleId={selectedCycleId} /> : <>
      {metrics.length ? <div className="space-y-5">{METRIC_GROUPS.map((group) => {
        const items = group.keys.map((key) => metrics.find((metric) => metric.key === key)).filter(Boolean);
        if (!items.length) return null;
        return <div key={group.title}><p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{group.title}</p><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{items.map((metric) => <MetricCard key={metric.key} metric={metric} />)}</div></div>;
      })}{ungroupedMetrics.length > 0 && <div><p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Other</p><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{ungroupedMetrics.map((metric) => <MetricCard key={metric.key} metric={metric} />)}</div></div>}</div> : <StatCard label="No KPI definitions received" value="—" hint="Apply the analytics backend migration and refresh." />}
      <section className="mt-8 grid gap-4 xl:grid-cols-2"><SectionCard title="Operational alerts" description="Threshold breaches and queues that need intervention."><AlertList alerts={alerts} onDrilldown={openDrilldown} /></SectionCard><SectionCard title="Application funnel" description="Progress, drop-off, and time spent at every workflow stage."><Funnel stages={funnel} onDrilldown={openDrilldown} /></SectionCard></section>
      <section className="mt-4 grid gap-4 lg:grid-cols-3"><SectionCard title="Workload & capacity" description="Mentor load, deadlines, reviews, and reassignment pressure."><RowList rows={asArray(workload.items ?? workload)} empty="No workload risks reported." onDrilldown={openDrilldown} /></SectionCard><SectionCard title="Compliance" description="Acknowledgements, documents, deadlines, and policy exceptions."><RowList rows={asArray(compliance.items ?? compliance)} empty="No compliance exceptions reported." onDrilldown={openDrilldown} /></SectionCard><SectionCard title="Data quality" description="Fix these records before relying on downstream reporting."><RowList rows={asArray(quality.items ?? quality)} empty="No data-quality exceptions reported." onDrilldown={openDrilldown} /></SectionCard></section>
    </>}
    <p className="mt-5 text-xs leading-5 text-slate-500">Privacy protection: analytics are scoped on the server. Suppressed or aggregated cohorts are intentionally not exposed as individual records.</p>
    {drilldown && <DrilldownDialog cycleId={selectedCycleId} metric={drilldown.metric} label={drilldown.label} onClose={() => setDrilldown(null)} />}
  </div>;
}
