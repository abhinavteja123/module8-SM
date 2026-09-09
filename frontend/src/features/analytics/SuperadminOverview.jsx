import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Card } from '../../components/ui/card.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { PageHeader, StatCard, EmptyState } from '../../components/ui/page.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Label } from '../../components/ui/label.jsx';
import { Select } from '../../components/ui/select.jsx';
import { useCycle } from '../../cycles/CycleContext.jsx';
import { getAnalyticsOverview } from './analyticsClient.js';

function TaskCard({ title, count, description, to, tone = 'indigo' }) {
  const colors = { indigo: 'border-indigo-200 bg-indigo-50', amber: 'border-amber-200 bg-amber-50', rose: 'border-rose-200 bg-rose-50' };
  return <Link to={to} className={`block rounded-2xl border p-5 transition hover:-translate-y-0.5 hover:shadow-md ${colors[tone]}`}><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-slate-950">{title}</p><p className="mt-1 text-sm leading-5 text-slate-600">{description}</p></div><span className="grid h-10 min-w-10 place-items-center rounded-xl bg-white px-2 text-xl font-bold text-slate-950 shadow-sm">{count}</span></div><p className="mt-4 text-sm font-bold text-indigo-700">Review now →</p></Link>;
}

function StatusList({ title, entries }) {
  const rows = Object.entries(entries ?? {}).map(([key, value]) => [key, Number(value?.value ?? value ?? 0)]).filter(([, value]) => value > 0);
  return <Card className="p-5"><h2 className="font-bold">{title}</h2>{rows.length ? <div className="mt-4 space-y-3">{rows.map(([key, value]) => <div key={key} className="flex items-center justify-between text-sm"><span className="capitalize text-slate-600">{key.replaceAll('_', ' ')}</span><Badge status={key}>{value}</Badge></div>)}</div> : <p className="mt-3 text-sm text-slate-500">Nothing needs attention right now.</p>}</Card>;
}

function trackLabel(track) {
  return { research: 'Research Internship', crcs_opportunity: 'CRCS Opportunity', self_internship: 'Self-Internship' }[track] ?? track;
}

function useDebouncedValue(value, delay = 250) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

function PeoplePicker({ type, selectedPeople, onChange, allInCycle, onAllInCycleChange }) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim());
  const { data: results = [], isFetching, error } = useQuery({
    queryKey: ['lock-people-search', type, debouncedSearch],
    queryFn: () => api(`/admin/locks/people?type=${type}&q=${encodeURIComponent(debouncedSearch)}`),
    enabled: debouncedSearch.length >= 2,
    staleTime: 60_000,
    retry: false,
  });
  const selectedIds = new Set(selectedPeople.map((person) => person.id));
  const toggle = (person) => onChange(selectedIds.has(person.id)
    ? selectedPeople.filter((selected) => selected.id !== person.id)
    : [...selectedPeople, person]);
  const remove = (id) => onChange(selectedPeople.filter((person) => person.id !== id));
  const personLabel = (person) => `${person.full_name}${person.roll_number ? ` · ${person.roll_number}` : ''}`;
  const heading = type === 'student' ? 'Students' : 'Faculty members';
  return <div className="mt-4"><Label>{heading} <span className="font-normal text-slate-500">({selectedPeople.length} selected)</span></Label>
    <button type="button" aria-pressed={allInCycle} onClick={() => { onAllInCycleChange(!allInCycle); if (!allInCycle) onChange([]); }} className={`mt-2 flex w-full items-center justify-between rounded-lg border px-3 py-3 text-left transition ${allInCycle ? 'border-indigo-500 bg-indigo-50 text-indigo-950' : 'border-slate-200 bg-white text-slate-800 hover:border-indigo-300'}`}><span className="font-semibold">{allInCycle ? `All ${type} in this cycle selected` : `Select all ${type} in this cycle`}</span><span className="text-xs font-medium text-slate-500">One bulk action</span></button>
    {!allInCycle && <>
    <Input className="mt-2" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${type === 'student' ? 'students' : 'faculty'} by name or email`} autoComplete="off" />
    {selectedPeople.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{selectedPeople.map((person) => <span key={person.id} className="inline-flex max-w-full items-center gap-1 rounded-full bg-indigo-100 px-3 py-1 text-sm font-medium text-indigo-950"><span className="truncate">{personLabel(person)}</span><button type="button" className="ml-1 text-indigo-700 hover:text-indigo-950" onClick={() => remove(person.id)} aria-label={`Remove ${person.full_name}`}>×</button></span>)}</div>}
    <div className="mt-2 max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
      {search.trim().length < 2 ? <p className="p-2 text-sm text-slate-500">Type at least 2 characters to find {type === 'student' ? 'students' : 'faculty'}.</p>
        : search.trim() !== debouncedSearch ? <p className="p-2 text-sm text-slate-500">Searching…</p>
        : isFetching ? <p className="p-2 text-sm text-slate-500">Searching…</p>
          : error ? <p className="p-2 text-sm text-red-700">{error.message}</p>
            : results.length ? results.map((person) => <label key={person.id} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-white"><input type="checkbox" checked={selectedIds.has(person.id)} onChange={() => toggle(person)} /><span className="min-w-0"><span className="block truncate text-sm font-medium text-slate-900">{personLabel(person)}</span><span className="block truncate text-xs text-slate-500">{person.email}</span></span></label>)
              : <p className="p-2 text-sm text-slate-500">No matching {type === 'student' ? 'students' : 'faculty'} in your access scope.</p>}
    </div>
    </>}
    <p className="mt-2 text-xs text-slate-500">{allInCycle ? 'This applies to every eligible person in the current cycle without loading them in this dialog.' : 'Choose one person or any number of people, then apply one action.'}</p>
  </div>;
}

function LockControlsDialog({ cycle, onClose }) {
  const queryClient = useQueryClient();
  const [action, setAction] = useState('lock');
  const [scope, setScope] = useState('everything');
  const [selectedPeople, setSelectedPeople] = useState([]);
  const [allInCycle, setAllInCycle] = useState(false);
  const [reason, setReason] = useState('');
  const { data: directory, isLoading: isDirectoryLoading, error: directoryError } = useQuery({ queryKey: ['portal-locks'], queryFn: () => api('/admin/locks'), enabled: scope === 'everything' });
  const apply = useMutation({
    mutationFn: async () => {
      const locked = action === 'lock';
      const setPreference = () => api(`/admin/cycles/${cycle.id}/preference-lock`, { method: 'PATCH', body: { locked } });
      const setPeople = (type, ids) => Promise.all(ids.map((id) => api(`/admin/locks/${type}/${id}`, { method: 'PATCH', body: { locked, reason: reason || undefined } })));
      if (scope === 'everything') await Promise.all([setPreference(), setPeople('student_portal', (directory?.students ?? []).map((student) => student.id)), ...['faculty_projects', 'faculty_assignments', 'faculty_marks'].map((type) => setPeople(type, (directory?.faculty ?? []).map((faculty) => faculty.id)))]);
      else if (scope === 'preferences') await setPreference();
      else if (allInCycle) await api('/admin/locks/bulk-cycle', { method: 'POST', body: { subject_type: scope === 'student_portals' ? 'student' : 'faculty', cycle_id: cycle.id, locked, reason: reason || undefined } });
      else if (scope === 'student_portals') await setPeople('student_portal', selectedPeople.map((person) => person.id));
      else await Promise.all(['faculty_projects', 'faculty_assignments', 'faculty_marks'].map((type) => setPeople(type, selectedPeople.map((person) => person.id))));
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['preference-control'] }); queryClient.invalidateQueries({ queryKey: ['portal-locks'] }); queryClient.invalidateQueries({ queryKey: ['portal-lock-audit'] }); onClose(); },
  });
  const targetMissing = ['student_portals', 'faculty_workspaces'].includes(scope) && !allInCycle && !selectedPeople.length;
  const optionDescription = {
    everything: 'Preferences, every student portal, and every faculty project, assignment, deadline, review, attendance, and marks workspace.',
    preferences: 'Only track-preference changes for the current internship cycle.',
    student_portals: allInCycle ? 'Every student enrolled in the current cycle.' : `${selectedPeople.length || 'No'} selected student portal${selectedPeople.length === 1 ? '' : 's'}.`,
    faculty_workspaces: allInCycle ? 'Every active faculty workspace in your access scope for the current cycle — projects, assignments, deadlines, reviews, attendance, and marks.' : `${selectedPeople.length || 'No'} selected faculty workspace${selectedPeople.length === 1 ? '' : 's'} — projects, assignments, deadlines, reviews, attendance, and marks.`,
  }[scope];
  return <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !apply.isPending) onClose(); }}><Card role="dialog" aria-modal="true" aria-label="Lock controls" className="max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto border-indigo-100 bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">CRCS control</p><h2 className="mt-1 text-xl font-bold text-slate-950">Lock or unlock access</h2><p className="mt-1 text-sm text-slate-600">Choose an access area, then search and select one or more people for one action.</p></div><Button type="button" variant="ghost" className="px-3 py-2" onClick={onClose} disabled={apply.isPending}>Close</Button></div>
    <div className="mt-5 grid gap-4 sm:grid-cols-2"><div><Label>Action</Label><Select value={action} onChange={(event) => setAction(event.target.value)}><option value="lock">Lock access</option><option value="unlock">Unlock access</option></Select></div><div><Label>What should change?</Label><Select value={scope} onChange={(event) => { setScope(event.target.value); setSelectedPeople([]); setAllInCycle(false); }}><option value="everything">Everything</option><option value="preferences">Preference changes only</option><option value="student_portals">Student portals</option><option value="faculty_workspaces">Faculty workspaces</option></Select></div></div>
    <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-950"><p className="font-semibold">{action === 'lock' ? 'This will be locked' : 'This will be unlocked'}</p><p className="mt-1 leading-5 text-indigo-800">{optionDescription}</p></div>
    {scope === 'student_portals' && <PeoplePicker type="student" selectedPeople={selectedPeople} onChange={setSelectedPeople} allInCycle={allInCycle} onAllInCycleChange={setAllInCycle} />}
    {scope === 'faculty_workspaces' && <PeoplePicker type="faculty" selectedPeople={selectedPeople} onChange={setSelectedPeople} allInCycle={allInCycle} onAllInCycleChange={setAllInCycle} />}
    {scope !== 'preferences' && <div className="mt-4"><Label>Reason <span className="font-normal text-slate-400">(optional)</span></Label><Input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} placeholder="For example: assessment period" /></div>}
    {directoryError && scope === 'everything' && <p className="mt-4 text-sm text-red-700">{directoryError.message}</p>}{apply.isError && <p className="mt-4 text-sm text-red-700">{apply.error.message}</p>}
    <div className="mt-6 flex justify-end gap-3"><Button type="button" variant="secondary" onClick={onClose} disabled={apply.isPending}>Cancel</Button><Button type="button" variant={action === 'lock' ? 'danger' : 'primary'} onClick={() => apply.mutate()} disabled={(scope === 'everything' && isDirectoryLoading) || targetMissing || apply.isPending}>{apply.isPending ? 'Saving…' : action === 'lock' ? 'Apply lock' : 'Apply unlock'}</Button></div>
  </Card></div>;
}

function PreferenceControl() {
  const queryClient = useQueryClient();
  const [showLockDialog, setShowLockDialog] = useState(false);
  const { data, isLoading, error } = useQuery({ queryKey: ['preference-control'], queryFn: () => api('/admin/preferences') });
  const decide = useMutation({ mutationFn: ({ id, decision }) => api(`/admin/preference-change-requests/${id}`, { method: 'PATCH', body: { decision } }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['preference-control'] }) });
  if (isLoading) return <Card className="px-4 py-3"><p className="text-sm text-slate-500">Loading preference controls…</p></Card>;
  if (error) return <Card className="px-4 py-3"><p className="text-sm text-red-700">Preference controls could not be loaded. Apply the preference-control migration, then refresh.</p></Card>;
  if (!data?.cycle) return <Card className="px-4 py-3"><p className="text-sm text-slate-600">Open an internship cycle to manage student preferences.</p></Card>;
  const locked = data.cycle.preference_changes_locked;
  const requestCount = data.requests.length;
  return <><Card className="px-4 py-3"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-x-3 gap-y-1"><h2 className="font-bold">Preference changes</h2><Badge status={locked ? 'revoked' : 'approved'}>{locked ? 'Locked' : 'Open'}</Badge><span className="text-sm text-slate-500">{requestCount ? `${requestCount} request${requestCount === 1 ? '' : 's'} waiting` : 'No requests'}</span></div><Button className="px-3 py-2" variant="danger" onClick={() => setShowLockDialog(true)}>Lock controls</Button></div>{requestCount > 0 && <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">{data.requests.map((request) => <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"><div><p className="font-semibold text-slate-900">{request.student?.full_name ?? 'Student'} <span className="font-normal text-slate-600">{trackLabel(request.current_track)} → {trackLabel(request.requested_track)}</span></p><p className="text-xs text-slate-500">{request.student?.email}</p></div><div className="flex gap-2"><Button className="px-3 py-2" variant="secondary" onClick={() => decide.mutate({ id: request.id, decision: 'reject' })} disabled={decide.isPending}>Reject</Button><Button className="px-3 py-2" onClick={() => decide.mutate({ id: request.id, decision: 'approve' })} disabled={decide.isPending}>Approve</Button></div></div>)}</div>}</Card>{showLockDialog && <LockControlsDialog cycle={data.cycle} onClose={() => setShowLockDialog(false)} />}</>;
}

export default function SuperadminOverview() {
  const { selectedCycle, selectedCycleId } = useCycle();
  const analytics = useQuery({ queryKey: ['analytics-overview', selectedCycleId, 'command-centre'], queryFn: () => getAnalyticsOverview(selectedCycleId), enabled: !!selectedCycleId });
  const research = useQuery({ queryKey: ['overview-research-pending'], queryFn: () => api('/research/applications?status=pending_crcs_approval') });
  const selfInternships = useQuery({ queryKey: ['overview-self-pending'], queryFn: () => api('/self-internships?status=submitted') });
  const opportunities = useQuery({ queryKey: ['overview-opportunity-pending'], queryFn: () => api('/opportunities/applications?status=applied') });
  const loading = analytics.isLoading || research.isLoading || selfInternships.isLoading || opportunities.isLoading;
  const data = analytics.data ?? {};
  const kpiValue = (key) => {
    const aliases = { student_count: 'enrolled_students', faculty_count: 'selected_students', pending_documents: 'average_faculty_review_hours', total_audit_events: 'active_internships' };
    const metricKey = aliases[key] ?? key;
    const metric = Array.isArray(data.kpis ?? data.metrics)
      ? (data.kpis ?? data.metrics).find((item) => item.key === metricKey || item.id === metricKey)
      : (data.kpis ?? data.metrics ?? {})[metricKey];
    return metric?.value ?? metric?.count ?? metric ?? data[key] ?? 0;
  };
  const tasks = [
    { title: 'Research approvals', count: research.data?.length ?? 0, description: 'Faculty-approved research applications waiting for CRCS.', to: '/crcs/research-approvals', tone: 'indigo' },
    { title: 'Self-internship requests', count: selfInternships.data?.length ?? 0, description: 'Student submissions waiting for a direct CRCS decision.', to: '/crcs/self-internship-approvals', tone: 'amber' },
    { title: 'New opportunity applications', count: opportunities.data?.length ?? 0, description: 'Students who have applied to a CRCS opportunity.', to: '/crcs/opportunities', tone: 'rose' },
  ];
  return <div><PageHeader eyebrow={`CRCS command centre${selectedCycle ? ` · ${selectedCycle.name}` : ''}`} title="Good morning, CRCS Administrator" description="Start with the items that need a decision. This overview is calculated for the selected cycle." />
    {loading ? <p className="text-sm text-slate-500">Preparing your overview…</p> : <><section><div className="mb-3 flex items-center justify-between"><div><h2 className="section-title">Needs your attention</h2><p className="mt-1 text-sm text-slate-600">These are the current actions waiting for CRCS.</p></div><p className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{tasks.reduce((sum, task) => sum + task.count, 0)} pending</p></div><div className="grid gap-4 lg:grid-cols-3">{tasks.map((task) => <TaskCard key={task.title} {...task} />)}</div></section>
      <section className="mt-9"><PreferenceControl /></section>
      <section className="mt-9"><h2 className="section-title">Programme snapshot</h2><p className="mt-1 text-sm text-slate-600">A trusted, cycle-specific picture of the work in progress.</p><div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Enrolled students" value={kpiValue('student_count')} hint="Students in this cycle" /><StatCard label="Track selections" value={kpiValue('faculty_count')} hint="Students who chose a pathway" tone="emerald" /><StatCard label="Avg. faculty review" value={`${kpiValue('pending_documents')} h`} hint="Time from application to faculty decision" tone="amber" /><StatCard label="Active internships" value={kpiValue('total_audit_events')} hint="Approved students now in progress" tone="slate" /></div></section>
      <section className="mt-9"><div className="mb-4 flex items-end justify-between"><div><h2 className="section-title">Programme intelligence</h2><p className="mt-1 text-sm text-slate-600">Use funnel, workload, and compliance signals to intervene early.</p></div><Link to="/crcs/analytics" className="text-sm font-bold text-indigo-700 hover:underline">Open full analytics →</Link></div><div className="grid gap-4 md:grid-cols-3"><StatusList title="Application funnel" entries={data.funnel} /><StatusList title="Workload & capacity" entries={data.workload} /><StatusList title="Compliance" entries={data.compliance} /></div></section>
      {tasks.every((task) => task.count === 0) && <div className="mt-8"><EmptyState title="You are all caught up" description="There are no pending CRCS decisions at the moment. Use the links above to manage opportunities or explore programme analytics." /></div>}</>}
  </div>;
}
