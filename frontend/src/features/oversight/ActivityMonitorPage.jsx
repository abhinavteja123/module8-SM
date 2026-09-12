import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { useCycle } from '../../cycles/CycleContext.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { hasRole } from '../../lib/permissions.js';
import { Badge } from '../../components/ui/badge.jsx';
import { Card } from '../../components/ui/card.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Select } from '../../components/ui/select.jsx';
import { Button } from '../../components/ui/button.jsx';
import { PageHeader, EmptyState } from '../../components/ui/page.jsx';

const PAGE_SIZE = 25;

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString() : null;
}

// Login tracking only started when this feature shipped — a null value means "no login
// recorded since tracking began", not "this person has never used the portal". If other
// signals (applications, postings, an audit-logged action) prove otherwise, say so instead
// of flatly claiming "Never logged in", which reads as a lie to anyone who can see those
// signals in the same row.
function LastLogin({ value, hasActivity }) {
  const formatted = formatDateTime(value);
  if (formatted) return <span className="whitespace-nowrap text-slate-700">{formatted}</span>;
  return <div><Badge status={hasActivity ? 'pending' : 'rejected'} className="whitespace-nowrap">No login recorded</Badge>{hasActivity && <p className="mt-1 text-xs text-slate-500">Active before login tracking began</p>}</div>;
}

function LastRecordedAction({ action }) {
  if (!action) return <span className="text-slate-500">No recorded activity</span>;
  return <div><p className="font-medium text-slate-800">{action.action?.replaceAll('_', ' ')}</p><p className="text-xs text-slate-500">{formatDateTime(action.at)}</p></div>;
}

function DetailModal({ personType, personId, cycleId, onClose }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['oversight-activity-detail', personType, personId, cycleId],
    queryFn: () => api(`/oversight/activity/${personType}/${personId}?cycle_id=${cycleId}`),
    enabled: !!personId,
  });
  const person = personType === 'student' ? data?.student : data?.faculty;
  return <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <Card role="dialog" aria-modal="true" aria-label="Activity detail" className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto border-indigo-200 bg-white p-6 shadow-2xl">
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Activity detail</p><h2 className="mt-1 text-xl font-bold text-slate-950">{person?.full_name ?? 'Loading…'}</h2>{person?.email && <p className="mt-1 text-sm text-slate-600">{person.email}{person.roll_number ? ` · ${person.roll_number}` : ''}{person.department ? ` · ${person.department}` : ''}</p>}</div><Button type="button" variant="ghost" className="px-3 py-2" onClick={onClose}>Close</Button></div>
      {isLoading && <p className="mt-6 text-sm text-slate-500">Loading…</p>}
      {error && <p className="mt-6 text-sm text-red-700">{error.message}</p>}
      {data && <div className="mt-6 space-y-5">
        <div className="grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
          <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Last login</p><div className="mt-1"><LastLogin value={person?.last_login_at} hasActivity={Boolean(data.last_recorded_action || data.applications?.length || data.research_projects?.length)} /></div></div>
          <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Last recorded action</p><div className="mt-1"><LastRecordedAction action={data.last_recorded_action} /></div></div>
          {personType === 'student' && <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Pathway</p><p className="mt-1 text-sm font-medium text-slate-900">{data.track_selected ? data.track_selected.replaceAll('_', ' ') : 'Not chosen yet'}</p></div>}
          {personType === 'faculty' && <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Mentorship scope</p><p className="mt-1 text-sm font-medium text-slate-900">{person?.mentorship_scope ?? '—'}</p></div>}
        </div>

        {personType === 'student' && <div>
          <h3 className="font-bold text-slate-900">Applications ({data.applications?.length ?? 0})</h3>
          {!data.applications?.length ? <p className="mt-2 text-sm text-slate-500">No applications submitted yet.</p> : <div className="mt-3 space-y-2">{data.applications.map((application) => <div key={`${application.type}-${application.id}`} className="rounded-lg border border-slate-200 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold text-slate-900">{application.title}</p><Badge status={application.status}>{application.status?.replaceAll('_', ' ')}</Badge></div><p className="mt-1 text-xs text-slate-500">{application.type.replaceAll('_', ' ')} · {formatDateTime(application.created_at)}</p></div>)}</div>}
        </div>}

        {personType === 'faculty' && <>
          <div>
            <h3 className="font-bold text-slate-900">Research projects posted ({data.research_projects?.length ?? 0})</h3>
            {!data.research_projects?.length ? <p className="mt-2 text-sm text-slate-500">No research projects posted yet.</p> : <div className="mt-3 space-y-2">{data.research_projects.map((project) => <div key={project.id} className="rounded-lg border border-slate-200 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold text-slate-900">{project.title}</p><Badge status={project.status}>{project.status}</Badge></div><p className="mt-1 text-xs text-slate-500">{project.approved_count}/{project.max_students} approved · posted {formatDateTime(project.created_at)}</p></div>)}</div>}
          </div>
          <div>
            <h3 className="font-bold text-slate-900">Current mentees ({data.mentees?.length ?? 0})</h3>
            {!data.mentees?.length ? <p className="mt-2 text-sm text-slate-500">No current mentees.</p> : <div className="mt-3 space-y-2">{data.mentees.map((mentee, index) => <div key={index} className="flex items-center justify-between rounded-lg border border-slate-200 p-3"><div><p className="font-semibold text-slate-900">{mentee.student?.full_name ?? 'Student'}</p><p className="text-xs text-slate-500">{mentee.student?.email}</p></div><span className="text-xs font-medium text-slate-600">{mentee.pathway.replaceAll('_', ' ')}</span></div>)}</div>}
          </div>
        </>}
      </div>}
    </Card>
  </div>;
}

export default function ActivityMonitorPage() {
  const { user } = useAuth();
  const { selectedCycle, selectedCycleId } = useCycle();
  const [personType, setPersonType] = useState('faculty');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [departmentId, setDepartmentId] = useState('');
  const [loginStatus, setLoginStatus] = useState('');
  const [pathway, setPathway] = useState('');
  const [activity, setActivity] = useState('');
  const [selectedPerson, setSelectedPerson] = useState(null);

  // A Faculty Coordinator's scope is already narrowed server-side to their mapped
  // faculty and mentees — a department filter would be meaningless (and misleading)
  // for them, so it's only offered to the department/school/system-wide roles.
  const showDepartmentFilter = hasRole(user, 'dean', 'school_office', 'crcs_coordinator', 'crcs_superadmin');
  const ownSchoolId = user?.roles?.find((role) => ['dean', 'school_office'].includes(role.role))?.school_id;
  const { data: departments = [] } = useQuery({
    queryKey: ['activity-filter-departments', ownSchoolId],
    queryFn: () => api(`/departments${ownSchoolId ? `?school_id=${ownSchoolId}` : ''}`),
    enabled: showDepartmentFilter,
  });

  const params = new URLSearchParams({ cycle_id: selectedCycleId ?? '', person_type: personType, page: String(page), page_size: String(PAGE_SIZE) });
  if (search.trim()) params.set('search', search.trim());
  if (departmentId) params.set('department_id', departmentId);
  if (loginStatus) params.set('login_status', loginStatus);
  if (pathway) params.set('pathway', pathway);
  if (activity) params.set('activity', activity);

  const { data, isLoading, error } = useQuery({
    queryKey: ['oversight-activity', selectedCycleId, personType, page, search, departmentId, loginStatus, pathway, activity],
    queryFn: () => api(`/oversight/activity?${params}`),
    enabled: !!selectedCycleId,
  });

  if (!selectedCycleId) return <div><PageHeader eyebrow="Activity monitor" title="Activity Monitor" description="See whether faculty and students are actually using the portal." /><EmptyState title="No open cycle yet" description="Activity data appears here once a cycle is open and selected." /></div>;

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const first = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const last = Math.min(page * PAGE_SIZE, total);

  const switchTab = (tab) => { setPersonType(tab); setPage(1); setSelectedPerson(null); setPathway(''); };
  const filtersActive = Boolean(search || departmentId || loginStatus || pathway || activity);
  const clearFilters = () => { setSearch(''); setDepartmentId(''); setLoginStatus(''); setPathway(''); setActivity(''); setPage(1); };

  return <div><PageHeader eyebrow={`Activity monitor${selectedCycle ? ` · ${selectedCycle.name}` : ''}`} title="Activity Monitor" description="Logins, research postings, and applications — a view of real portal usage, not just enrollment counts. Click a row for full details." />
    <div className="portal-tabbar">
      <button type="button" onClick={() => switchTab('faculty')} className={`portal-tab ${personType === 'faculty' ? 'portal-tab-active' : 'border-transparent'}`}>Faculty</button>
      <button type="button" onClick={() => switchTab('student')} className={`portal-tab ${personType === 'student' ? 'portal-tab-active' : 'border-transparent'}`}>Students</button>
    </div>
    <Card className="p-5">
      <div className="flex flex-wrap gap-3">
        <Input className="min-w-[200px] flex-1" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search by name or email" />
        {showDepartmentFilter && <Select aria-label="Filter by department" className="!w-auto min-w-[160px]" value={departmentId} onChange={(event) => { setDepartmentId(event.target.value); setPage(1); }}><option value="">All departments</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</Select>}
        <Select aria-label="Filter by login status" className="!w-auto min-w-[160px]" value={loginStatus} onChange={(event) => { setLoginStatus(event.target.value); setPage(1); }}><option value="">Any login status</option><option value="logged_in">Logged in</option><option value="never">No login recorded</option></Select>
        {personType === 'student' && <Select aria-label="Filter by pathway" className="!w-auto min-w-[160px]" value={pathway} onChange={(event) => { setPathway(event.target.value); setPage(1); }}><option value="">Any pathway</option><option value="research">Research</option><option value="crcs_opportunity">CRCS opportunity</option><option value="self_internship">Self-internship</option><option value="none">Not chosen yet</option></Select>}
        <Select aria-label={personType === 'student' ? 'Filter by applications' : 'Filter by activity'} className="!w-auto min-w-[160px]" value={activity} onChange={(event) => { setActivity(event.target.value); setPage(1); }}><option value="">{personType === 'student' ? 'Any application status' : 'Any activity level'}</option><option value="active">{personType === 'student' ? 'Has applied' : 'Has posted or mentees'}</option><option value="none">{personType === 'student' ? 'No applications' : 'No activity'}</option></Select>
        {filtersActive && <Button type="button" variant="secondary" onClick={clearFilters}>Clear filters</Button>}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">{isLoading ? 'Loading activity…' : <><span className="font-bold text-slate-900">{first}-{last}</span> of {total} shown</>}</p>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1 || isLoading}>Previous</Button>
          <Button variant="secondary" onClick={() => setPage((value) => Math.min(lastPage, value + 1))} disabled={page >= lastPage || isLoading}>Next</Button>
        </div>
      </div>
    </Card>
    {isLoading ? <p className="mt-6 text-sm text-slate-500">Loading activity…</p> : error ? <p className="mt-6 text-sm text-red-600">{error.message}</p> : !items.length ? <div className="mt-6"><EmptyState title="No matching people" description="Try a different search or filter." /></div> : <Card className="mt-6 overflow-hidden"><div className="overflow-x-auto">
      {personType === 'faculty' ? <table className="min-w-[900px] w-full text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Name / email</th><th className="px-4 py-3">Department</th><th className="px-4 py-3">Last login</th><th className="px-4 py-3">Research posted</th><th className="px-4 py-3">Active mentees</th><th className="px-4 py-3">Last recorded action</th></tr></thead><tbody className="divide-y divide-slate-100">{items.map((person) => <tr key={person.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setSelectedPerson(person.id)}><td className="px-4 py-3"><p className="font-semibold text-indigo-700">{person.full_name}</p><p className="text-xs text-slate-500">{person.email}</p></td><td className="px-4 py-3 text-slate-700">{person.department ?? '—'}</td><td className="px-4 py-3"><LastLogin value={person.last_login_at} hasActivity={Boolean(person.research_projects_posted || person.last_recorded_action)} /></td><td className="px-4 py-3"><p className="font-medium text-slate-800">{person.research_projects_posted ?? 0}</p>{person.latest_research_posted_at && <p className="text-xs text-slate-500">Latest {formatDateTime(person.latest_research_posted_at)}</p>}</td><td className="px-4 py-3 text-slate-700">{person.active_mentees ?? 0}</td><td className="px-4 py-3"><LastRecordedAction action={person.last_recorded_action} /></td></tr>)}</tbody></table>
      : <table className="min-w-[900px] w-full text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Name / email / roll no.</th><th className="px-4 py-3">Department</th><th className="px-4 py-3">Last login</th><th className="px-4 py-3">Pathway</th><th className="px-4 py-3">Applications</th><th className="px-4 py-3">Last recorded action</th></tr></thead><tbody className="divide-y divide-slate-100">{items.map((person) => <tr key={person.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setSelectedPerson(person.id)}><td className="px-4 py-3"><p className="font-semibold text-indigo-700">{person.full_name}</p><p className="text-xs text-slate-500">{person.email}{person.roll_number ? ` · ${person.roll_number}` : ''}</p></td><td className="px-4 py-3 text-slate-700">{person.department ?? '—'}</td><td className="px-4 py-3"><LastLogin value={person.last_login_at} hasActivity={Boolean(person.applications_count || person.last_recorded_action)} /></td><td className="px-4 py-3 text-slate-700">{person.track_selected ? person.track_selected.replaceAll('_', ' ') : 'Not chosen yet'}</td><td className="px-4 py-3"><p className="font-medium text-slate-800">{person.applications_count ?? 0}</p>{person.latest_application_at && <p className="text-xs text-slate-500">Latest {formatDateTime(person.latest_application_at)}</p>}</td><td className="px-4 py-3"><LastRecordedAction action={person.last_recorded_action} /></td></tr>)}</tbody></table>}
    </div></Card>}
    {selectedPerson && <DetailModal personType={personType} personId={selectedPerson} cycleId={selectedCycleId} onClose={() => setSelectedPerson(null)} />}
  </div>;
}
