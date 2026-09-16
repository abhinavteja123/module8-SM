import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Card } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { EmptyState, PageHeader, StatCard } from '../../components/ui/page.jsx';
import { useCycle } from '../../cycles/CycleContext.jsx';
import { downloadAnalyticsExport, getAnalyticsDrilldown, getAnalyticsOverview } from './analyticsClient.js';

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
  { title: 'Approvals & outcomes', keys: ['approval_rate', 'active_internships', 'completed_internships'] },
  { title: 'Turnaround time', keys: ['average_crcs_decision_hours', 'average_faculty_review_hours'] },
];

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
  const rows = asArray(alerts);
  if (!rows.length) return <p className="text-sm text-emerald-700">No operational thresholds are currently breached.</p>;
  const styles = { critical: 'border-red-200 bg-red-50', high: 'border-amber-200 bg-amber-50', warning: 'border-amber-200 bg-amber-50' };
  return <div className="space-y-2">{rows.map((alert, index) => <button key={alert.id ?? alert.key ?? index} type="button" onClick={() => onDrilldown(alert.metric ?? alert.key ?? 'alerts', alert.title ?? alert.label ?? 'Operational alert')} className={`w-full rounded-lg border p-3 text-left hover:brightness-95 ${styles[alert.severity] ?? 'border-indigo-200 bg-indigo-50'}`}><div className="flex justify-between gap-3"><span className="font-semibold text-slate-950">{alert.title ?? alert.label ?? titleize(alert.key)}</span><span className="text-sm font-bold text-slate-900">{alert.count ?? ''}</span></div><p className="mt-1 text-sm text-slate-700">{alert.description ?? alert.message ?? 'Review the affected records.'}</p></button>)}</div>;
}

function DrilldownDialog({ cycleId, metric, label, filters, onClose }) {
  const { data, isLoading, error } = useQuery({ queryKey: ['analytics-drilldown', cycleId, metric, filters], queryFn: () => getAnalyticsDrilldown(cycleId, metric, filters), enabled: !!cycleId && !!metric });
  const rows = data?.records ?? data?.items ?? data?.rows ?? (Array.isArray(data) ? data : []);
  const fields = rows[0] ? Object.keys(rows[0]).filter((key) => typeof rows[0][key] !== 'object') : [];
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><Card role="dialog" aria-modal="true" aria-label={`${label} records`} className="max-h-[calc(100vh-2rem)] w-full max-w-4xl overflow-auto p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Permission-scoped drill-down</p><h2 className="mt-1 text-xl font-bold text-slate-950">{label}</h2><p className="mt-1 text-sm text-slate-600">Only records within your server-enforced access scope are shown.</p></div><Button variant="ghost" onClick={onClose}>Close</Button></div>{isLoading ? <p className="mt-6 text-sm text-slate-500">Loading records…</p> : error ? <p className="mt-6 text-sm text-red-700">{error.message}</p> : !rows.length ? <p className="mt-6 text-sm text-slate-500">No records match this metric and filter.</p> : <div className="mt-6 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-slate-200 text-slate-500"><tr>{fields.map((key) => <th key={key} className="px-3 py-2 font-semibold">{titleize(key)}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.id ?? index} className="border-b border-slate-100">{fields.map((key) => <td key={key} className="max-w-56 truncate px-3 py-2 text-slate-700">{String(row[key] ?? '—')}</td>)}</tr>)}</tbody></table></div>}</Card></div>;
}

function parseFilters(searchParams) { const status = searchParams.get('status'); return status ? { status } : {}; }

export function OperationalAnalyticsDashboard({ eyebrow, title, description }) {
  const { selectedCycle, selectedCycleId, isLoading: cyclesLoading } = useCycle();
  const [searchParams, setSearchParams] = useSearchParams();
  const [drilldown, setDrilldown] = useState(null);
  const [exportError, setExportError] = useState('');
  const filters = useMemo(() => parseFilters(searchParams), [searchParams]);
  const overview = useQuery({ queryKey: ['analytics-overview', selectedCycleId], queryFn: () => getAnalyticsOverview(selectedCycleId), enabled: !!selectedCycleId, staleTime: 30_000 });
  const data = overview.data;
  const metrics = metricItems(data);
  const groupedMetricKeys = useMemo(() => new Set(METRIC_GROUPS.flatMap((group) => group.keys)), []);
  const ungroupedMetrics = metrics.filter((metric) => !groupedMetricKeys.has(metric.key));
  const funnel = data?.funnel?.stages ?? data?.funnel ?? data?.application_funnel;
  const workload = data?.workload ?? data?.capacity ?? {};
  const compliance = data?.compliance ?? {};
  const quality = data?.data_quality ?? data?.quality ?? {};
  const alerts = data?.alerts ?? data?.operational_alerts ?? [];
  const historical = data?.historical ?? data?.trends ?? [];
  const freshness = data?.calculated_at ?? data?.last_updated ?? data?.freshness?.calculated_at;
  const openDrilldown = (metric, label) => setDrilldown({ metric, label });
  const setStatus = (event) => { const next = new URLSearchParams(searchParams); if (event.target.value) next.set('status', event.target.value); else next.delete('status'); setSearchParams(next, { replace: true }); };
  const exportOverview = async (format) => { setExportError(''); try { await downloadAnalyticsExport(selectedCycleId, 'overview', format); } catch (error) { setExportError(error.message); } };
  if (cyclesLoading || overview.isLoading) return <p className="text-sm text-slate-500">Preparing the selected cycle’s analytics…</p>;
  if (!selectedCycleId) return <EmptyState title="Choose an internship cycle" description="Analytics are only calculated for one cycle at a time." />;
  if (overview.error) return <EmptyState title="We couldn’t load this analytics view" description={overview.error.message || 'Please refresh the page. If the problem continues, contact the portal administrator.'} />;
  if (!data) return <EmptyState title="No analytics yet" description="This overview will fill in as work is completed in the selected cycle." />;
  return <div><PageHeader eyebrow={eyebrow ?? `Analytics · ${selectedCycle?.name ?? 'Selected cycle'}`} title={title ?? 'Operational intelligence'} description={description ?? 'Use trusted, cycle-specific metrics to intervene before work falls behind.'} action={<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => navigator.clipboard?.writeText(window.location.href)}>Copy view link</Button><Button variant="secondary" onClick={() => exportOverview('pdf')}>Export PDF</Button><Button onClick={() => exportOverview('csv')}>Export CSV</Button></div>} />
    {exportError && <p className="-mt-4 mb-5 text-sm text-red-700">{exportError}</p>}
    <Card className="mb-6 border-indigo-100 bg-indigo-50 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold text-indigo-950">Trusted metric context</p><p className="mt-1 text-sm text-indigo-900">Cycle: {selectedCycle?.name ?? selectedCycleId} · Scope: {data.viewer_scope?.label ?? data.viewer_scope ?? 'Your permitted records'} · Definitions, exclusions, and drill-downs are shown on each KPI.</p></div><p className="text-xs font-medium text-indigo-800">Last calculated: {freshness ? new Date(freshness).toLocaleString() : 'Not supplied'}</p></div></Card>
    <div className="mb-6 flex flex-wrap items-center gap-3"><label className="text-sm font-medium text-slate-700">Status filter <select className="ml-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" value={filters.status ?? ''} onChange={setStatus}><option value="">All statuses</option>{asArray(data?.filter_options?.statuses ?? data?.statuses ?? []).map((item) => { const value = item.value ?? item.key ?? item; return <option key={value} value={value}>{item.label ?? titleize(value)}</option>; })}</select></label><p className="text-xs text-slate-500">Filters are kept in this URL so the view can be reproduced.</p></div>
    {metrics.length ? <div className="space-y-5">{METRIC_GROUPS.map((group) => {
      const items = group.keys.map((key) => metrics.find((metric) => metric.key === key)).filter(Boolean);
      if (!items.length) return null;
      return <div key={group.title}><p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{group.title}</p><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{items.map((metric) => <MetricCard key={metric.key} metric={metric} />)}</div></div>;
    })}{ungroupedMetrics.length > 0 && <div><p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Other</p><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{ungroupedMetrics.map((metric) => <MetricCard key={metric.key} metric={metric} />)}</div></div>}</div> : <StatCard label="No KPI definitions received" value="—" hint="Apply the analytics backend migration and refresh." />}
    <section className="mt-8 grid gap-4 xl:grid-cols-2"><SectionCard title="Operational alerts" description="Threshold breaches and queues that need intervention."><AlertList alerts={alerts} onDrilldown={openDrilldown} /></SectionCard><SectionCard title="Application funnel" description="Progress, drop-off, and time spent at every workflow stage."><Funnel stages={funnel} onDrilldown={openDrilldown} /></SectionCard></section>
    <section className="mt-4 grid gap-4 lg:grid-cols-3"><SectionCard title="Workload & capacity" description="Mentor load, deadlines, reviews, and reassignment pressure."><RowList rows={asArray(workload.items ?? workload)} empty="No workload risks reported." onDrilldown={openDrilldown} /></SectionCard><SectionCard title="Compliance" description="Acknowledgements, documents, deadlines, and policy exceptions."><RowList rows={asArray(compliance.items ?? compliance)} empty="No compliance exceptions reported." onDrilldown={openDrilldown} /></SectionCard><SectionCard title="Data quality" description="Fix these records before relying on downstream reporting."><RowList rows={asArray(quality.items ?? quality)} empty="No data-quality exceptions reported." onDrilldown={openDrilldown} /></SectionCard></section>
    <section className="mt-4"><SectionCard title="Historical comparison" description="Compare cycle outcomes and trends. Small cohorts may be suppressed to protect privacy.">{historical.length || Object.keys(historical).length ? <RowList rows={asArray(historical)} empty="No historical data available." onDrilldown={openDrilldown} /> : <p className="text-sm text-slate-500">Historical comparisons will appear once there is more than one accessible cycle.</p>}</SectionCard></section>
    <p className="mt-5 text-xs leading-5 text-slate-500">Privacy protection: analytics are scoped on the server. Suppressed or aggregated cohorts are intentionally not exposed as individual records.</p>
    {drilldown && <DrilldownDialog cycleId={selectedCycleId} metric={drilldown.metric} label={drilldown.label} filters={filters} onClose={() => setDrilldown(null)} />}
  </div>;
}
