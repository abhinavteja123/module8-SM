import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Card } from '../../components/ui/card.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { PageHeader, StatCard, EmptyState } from '../../components/ui/page.jsx';
import { Button } from '../../components/ui/button.jsx';

function TaskCard({ title, count, description, to, tone = 'indigo' }) {
  const colors = { indigo: 'border-indigo-200 bg-indigo-50', amber: 'border-amber-200 bg-amber-50', rose: 'border-rose-200 bg-rose-50' };
  return <Link to={to} className={`block rounded-2xl border p-5 transition hover:-translate-y-0.5 hover:shadow-md ${colors[tone]}`}><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-slate-950">{title}</p><p className="mt-1 text-sm leading-5 text-slate-600">{description}</p></div><span className="grid h-10 min-w-10 place-items-center rounded-xl bg-white px-2 text-xl font-bold text-slate-950 shadow-sm">{count}</span></div><p className="mt-4 text-sm font-bold text-indigo-700">Review now →</p></Link>;
}

function StatusList({ title, entries }) {
  const rows = Object.entries(entries ?? {}).filter(([, value]) => value > 0);
  return <Card className="p-5"><h2 className="font-bold">{title}</h2>{rows.length ? <div className="mt-4 space-y-3">{rows.map(([key, value]) => <div key={key} className="flex items-center justify-between text-sm"><span className="capitalize text-slate-600">{key.replaceAll('_', ' ')}</span><Badge status={key}>{value}</Badge></div>)}</div> : <p className="mt-3 text-sm text-slate-500">Nothing needs attention right now.</p>}</Card>;
}

function trackLabel(track) {
  return { research: 'Research Internship', crcs_opportunity: 'CRCS Opportunity', self_internship: 'Self-Internship' }[track] ?? track;
}

function PreferenceControl() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['preference-control'], queryFn: () => api('/admin/preferences') });
  const lock = useMutation({ mutationFn: ({ cycleId, locked }) => api(`/admin/cycles/${cycleId}/preference-lock`, { method: 'PATCH', body: { locked } }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['preference-control'] }) });
  const decide = useMutation({ mutationFn: ({ id, decision }) => api(`/admin/preference-change-requests/${id}`, { method: 'PATCH', body: { decision } }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['preference-control'] }) });
  if (isLoading) return <Card className="p-5"><p className="text-sm text-slate-500">Loading preference controls…</p></Card>;
  if (error) return <Card className="p-5"><p className="text-sm text-red-700">Preference controls could not be loaded. Apply the preference-control migration, then refresh.</p></Card>;
  if (!data?.cycle) return <Card className="p-5"><h2 className="font-bold">Student preference controls</h2><p className="mt-2 text-sm text-slate-600">Open an internship cycle before setting preference rules.</p></Card>;
  const locked = data.cycle.preference_changes_locked;
  return <Card className="p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-bold">Student preference controls</h2><p className="mt-1 text-sm text-slate-600">{locked ? 'Preferences are locked. Students must request CRCS approval to change their path.' : 'Students can currently change their internship preference themselves.'}</p></div><Button variant={locked ? 'secondary' : 'danger'} onClick={() => lock.mutate({ cycleId: data.cycle.id, locked: !locked })} disabled={lock.isPending}>{lock.isPending ? 'Updating…' : locked ? 'Allow preference changes' : 'Stop changing preferences'}</Button></div><div className="mt-5 border-t border-slate-100 pt-5"><div className="mb-3 flex items-center justify-between"><div><h3 className="font-semibold">Change requests</h3><p className="form-help">Approve to move the student to their requested dashboard.</p></div><Badge status="pending">{data.requests.length} pending</Badge></div>{!data.requests.length ? <p className="text-sm text-slate-500">No preference-change requests are waiting.</p> : <div className="space-y-3">{data.requests.map((request) => <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-4"><div><p className="font-semibold text-slate-900">{request.student?.full_name ?? 'Student'}</p><p className="text-sm text-slate-600">{trackLabel(request.current_track)} → {trackLabel(request.requested_track)}</p><p className="text-xs text-slate-500">{request.student?.email}</p></div><div className="flex gap-2"><Button variant="secondary" onClick={() => decide.mutate({ id: request.id, decision: 'reject' })} disabled={decide.isPending}>Reject</Button><Button onClick={() => decide.mutate({ id: request.id, decision: 'approve' })} disabled={decide.isPending}>Approve</Button></div></div>)}</div>}</div></Card>;
}

export default function SuperadminOverview() {
  const analytics = useQuery({ queryKey: ['analytics-system'], queryFn: () => api('/analytics/system') });
  const research = useQuery({ queryKey: ['overview-research-pending'], queryFn: () => api('/research/applications?status=pending_crcs_approval') });
  const selfInternships = useQuery({ queryKey: ['overview-self-pending'], queryFn: () => api('/self-internships?status=submitted') });
  const opportunities = useQuery({ queryKey: ['overview-opportunity-pending'], queryFn: () => api('/opportunities/applications?status=applied') });
  const loading = analytics.isLoading || research.isLoading || selfInternships.isLoading || opportunities.isLoading;
  const data = analytics.data ?? {};
  const tasks = [
    { title: 'Research approvals', count: research.data?.length ?? 0, description: 'Faculty-approved research applications waiting for CRCS.', to: '/crcs/research-approvals', tone: 'indigo' },
    { title: 'Self-internship requests', count: selfInternships.data?.length ?? 0, description: 'Student submissions waiting for a direct CRCS decision.', to: '/crcs/self-internship-approvals', tone: 'amber' },
    { title: 'New opportunity applications', count: opportunities.data?.length ?? 0, description: 'Students who have applied to a CRCS opportunity.', to: '/crcs/opportunities', tone: 'rose' },
  ];
  return <div><PageHeader eyebrow="CRCS command centre" title="Good morning, CRCS Administrator" description="Start with the items that need a decision. This overview updates as students, faculty, and coordinators use the portal." />
    {loading ? <p className="text-sm text-slate-500">Preparing your overview…</p> : <><section><div className="mb-3 flex items-center justify-between"><div><h2 className="section-title">Needs your attention</h2><p className="mt-1 text-sm text-slate-600">These are the current actions waiting for CRCS.</p></div><p className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{tasks.reduce((sum, task) => sum + task.count, 0)} pending</p></div><div className="grid gap-4 lg:grid-cols-3">{tasks.map((task) => <TaskCard key={task.title} {...task} />)}</div></section>
      <section className="mt-9"><PreferenceControl /></section>
      <section className="mt-9"><h2 className="section-title">Programme snapshot</h2><p className="mt-1 text-sm text-slate-600">A quick picture of the current internship cycle.</p><div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Students" value={data.student_count} hint="Registered in the portal" /><StatCard label="Faculty mentors" value={data.faculty_count} hint="Available to guide students" tone="emerald" /><StatCard label="Documents waiting" value={data.pending_documents} hint="Reports awaiting review" tone="amber" /><StatCard label="Recent activity" value={data.total_audit_events} hint="Recorded portal updates" tone="slate" /></div></section>
      <section className="mt-9"><div className="mb-4 flex items-end justify-between"><div><h2 className="section-title">Progress by pathway</h2><p className="mt-1 text-sm text-slate-600">Use this to spot bottlenecks without reading raw system data.</p></div><Link to="/crcs/analytics" className="text-sm font-bold text-indigo-700 hover:underline">Open full analytics →</Link></div><div className="grid gap-4 md:grid-cols-3"><StatusList title="Research applications" entries={data.research_applications_by_status} /><StatusList title="CRCS opportunities" entries={data.opportunity_applications_by_status} /><StatusList title="Self-internships" entries={data.self_internships_by_status} /></div></section>
      {tasks.every((task) => task.count === 0) && <div className="mt-8"><EmptyState title="You are all caught up" description="There are no pending CRCS decisions at the moment. Use the links above to manage opportunities or explore programme analytics." /></div>}</>}
  </div>;
}
