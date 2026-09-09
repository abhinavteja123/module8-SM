import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { hasRole } from '../../lib/permissions.js';
import { Badge } from '../../components/ui/badge.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Card } from '../../components/ui/card.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Select } from '../../components/ui/select.jsx';
import { EmptyState, PageHeader, StatCard } from '../../components/ui/page.jsx';
import StudentDetailsModal from './StudentDetailsModal.jsx';

const typeLabels = { opportunity: 'CRCS opportunity', self_internship: 'Self-internship', research: 'Research internship' };
const typeOptions = Object.entries(typeLabels);

function initials(name) {
  return (name ?? 'Student').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function Hierarchy({ hierarchy }) {
  if (!hierarchy) return null;
  return <p className="mt-2 text-xs leading-5 text-slate-600">{hierarchy.department?.name ?? 'Department not configured'} · {hierarchy.school?.name ?? 'School not configured'} · HOD: {hierarchy.hod?.full_name ?? 'Not configured'}</p>;
}

function AllocationCard({ mapping, mentors, canAllocate, onViewStudent, onAllocated }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(!mapping.mentor && mapping.type !== 'research');
  const [mentorId, setMentorId] = useState(mapping.mentor_id ?? '');
  const selectedMentor = mentors.find((mentor) => mentor.id === mentorId);
  const canEdit = canAllocate && mapping.type !== 'research';
  const allocation = useMutation({
    mutationFn: () => api(mapping.type === 'opportunity' ? `/opportunities/applications/${mapping.id}/mentor` : `/self-internships/${mapping.id}/mentor`, { method: 'PATCH', body: { mentor_id: mentorId } }),
    onSuccess: () => {
      setEditing(false);
      onAllocated(`${mapping.student?.full_name ?? 'Student'} has been assigned to ${selectedMentor?.full_name ?? 'the selected mentor'}.`);
      queryClient.invalidateQueries({ queryKey: ['mentor-allocations'] });
      queryClient.invalidateQueries({ queryKey: ['mentor-allocation-options'] });
    },
  });
  const isAllocated = Boolean(mapping.mentor);
  const student = mapping.student ?? {};
  const capacity = selectedMentor ? `${selectedMentor.active_allocations ?? 0} of ${selectedMentor.allocation_limit ?? 5} places in use` : null;

  return <article className={`rounded-2xl border bg-white p-5 shadow-sm ${isAllocated ? 'border-slate-200' : 'border-amber-200 shadow-amber-100/50'}`}><div className="flex flex-wrap items-start justify-between gap-4"><div className="flex min-w-0 items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-100 text-sm font-bold text-indigo-700">{initials(student.full_name)}</span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => onViewStudent(student)} className="font-bold text-indigo-700 hover:underline focus:outline-none focus:ring-2 focus:ring-indigo-500">{student.full_name ?? 'Student'}</button><Badge status={isAllocated ? 'approved' : 'pending'}>{isAllocated ? 'Mentor allocated' : 'Needs mentor'}</Badge></div><p className="mt-1 truncate text-sm text-slate-600">{student.email ?? 'Email not available'}</p><p className="mt-1 text-xs text-slate-500">{student.roll_number ?? 'Roll number not provided'}{student.department?.name ? ` · ${student.department.name}` : ''}</p></div></div><button type="button" onClick={() => onViewStudent(student)} className="text-sm font-semibold text-indigo-700 hover:underline">Student details →</button></div>
    <div className="mt-5 grid gap-4 border-y border-slate-100 py-4 md:grid-cols-2"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Approved internship</p><p className="mt-1 font-semibold text-slate-900">{mapping.title}</p><p className="mt-1 text-sm text-slate-600">{typeLabels[mapping.type]}{mapping.subtitle && mapping.subtitle !== 'Self-internship' ? ` · ${mapping.subtitle}` : ''}</p></div><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Faculty mentor</p>{isAllocated ? <><p className="mt-1 font-semibold text-slate-900">{mapping.mentor.full_name}</p><p className="mt-1 text-sm text-slate-600">{mapping.mentor.email}</p><Hierarchy hierarchy={mapping.mentor_hierarchy} /></> : <p className="mt-1 text-sm font-semibold text-amber-800">Waiting for an eligible faculty mentor</p>}</div></div>
    {mapping.type === 'research' ? <p className="mt-4 text-sm text-slate-600">Research mentor changes are handled from the Research Mentor Reassignment workspace.</p> : canEdit && editing ? <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold text-indigo-950">{isAllocated ? 'Change faculty mentor' : 'Assign faculty mentor'}</h3><p className="mt-1 text-sm text-indigo-900">Choose an available mentor. The student is notified immediately and the mentor's academic hierarchy is applied automatically.</p></div>{capacity && <Badge status="approved">{capacity}</Badge>}</div><div className="mt-4 flex flex-col gap-2 sm:flex-row"><Select aria-label={`Faculty mentor for ${student.full_name ?? 'student'}`} value={mentorId} onChange={(event) => setMentorId(event.target.value)}><option value="">Choose an available faculty mentor</option>{mentors.map((mentor) => <option key={mentor.id} value={mentor.id}>{mentor.full_name} · {mentor.active_allocations ?? 0}/{mentor.allocation_limit ?? 5} students</option>)}</Select><Button onClick={() => allocation.mutate()} disabled={!mentorId || mentorId === mapping.mentor_id || allocation.isPending}>{allocation.isPending ? 'Saving…' : isAllocated ? 'Save mentor change' : 'Assign and notify'}</Button><Button variant="ghost" onClick={() => { setMentorId(mapping.mentor_id ?? ''); setEditing(false); }}>Cancel</Button></div>{!mentors.length && <p className="mt-3 text-sm text-amber-900">No faculty mentors currently have capacity. Free a mentor assignment before continuing.</p>}{allocation.isError && <p className="mt-3 text-sm text-red-700">{allocation.error.message}</p>}</div> : canEdit ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">{mapping.last_updated_at ? `Last updated ${new Date(mapping.last_updated_at).toLocaleString()}` : 'Student and mentor will see this allocation right away.'}</p><Button variant="secondary" onClick={() => { setMentorId(''); setEditing(true); }}>Change mentor</Button></div> : null}
  </article>;
}

export default function MentorAllocationsPage() {
  const { user } = useAuth();
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [view, setView] = useState('waiting');
  const [success, setSuccess] = useState('');
  const canAllocate = hasRole(user, 'crcs_superadmin');
  const { data, isLoading, error } = useQuery({ queryKey: ['mentor-allocations'], queryFn: () => api('/mentor-allocations') });
  const { data: mentors = [] } = useQuery({ queryKey: ['mentor-allocation-options'], queryFn: () => api('/opportunities/mentor-options'), enabled: canAllocate });
  const mappings = data?.mappings ?? [];
  const waiting = mappings.filter((mapping) => !mapping.mentor && mapping.type !== 'research');
  const allocated = mappings.filter((mapping) => Boolean(mapping.mentor));
  const visibleMappings = useMemo(() => mappings.filter((mapping) => {
    const matchesView = view === 'waiting' ? !mapping.mentor && mapping.type !== 'research' : view === 'allocated' ? Boolean(mapping.mentor) : true;
    const matchesType = !type || mapping.type === type;
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [mapping.student?.full_name, mapping.student?.email, mapping.student?.roll_number, mapping.title, mapping.mentor?.full_name].filter(Boolean).join(' ').toLowerCase().includes(query);
    return matchesView && matchesType && matchesSearch;
  }), [mappings, view, type, search]);
  const visibleDepartmentCodes = [...new Set(visibleMappings.map((mapping) => mapping.student?.department?.code).filter(Boolean))];
  const clearFilters = () => { setSearch(''); setType(''); setView('waiting'); };

  return <div className="max-w-6xl space-y-6"><PageHeader eyebrow="Mentor management" title="Mentor allocations" description={canAllocate ? 'Assign a faculty mentor after CRCS approval. The student is notified immediately; hierarchy, deadlines, report access, and deadline reminders then follow automatically.' : 'Review the post-approval mentor assignments available within your role and scope.'} />
    <Card className="border-indigo-100 bg-indigo-50 p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-bold text-indigo-950">What happens after CRCS approval?</h2><p className="mt-1 text-sm text-indigo-900">Assign one available faculty mentor, then the student can receive deadlines and submit reports.</p></div><Badge status="approved">No manual hierarchy setup is needed.</Badge></div><ol className="mt-4 grid gap-2 text-sm sm:grid-cols-4"><li className="rounded-lg bg-white/75 p-3"><strong>1. Approved</strong><span className="mt-1 block text-slate-600">Internship is confirmed.</span></li><li className="rounded-lg bg-white/75 p-3"><strong>2. Assign</strong><span className="mt-1 block text-slate-600">Choose an eligible mentor.</span></li><li className="rounded-lg bg-white/75 p-3"><strong>3. Notify</strong><span className="mt-1 block text-slate-600">Student is updated instantly.</span></li><li className="rounded-lg bg-white/75 p-3"><strong>4. Supervise</strong><span className="mt-1 block text-slate-600">Deadlines and reports open.</span></li></ol></Card>
    <div className="grid gap-4 sm:grid-cols-3"><StatCard label="Needs allocation" value={waiting.length} hint="Approved students waiting for a mentor" tone="amber" /><StatCard label="Allocated" value={allocated.length} hint="Students ready for supervision" tone="emerald" /><StatCard label="Mentors with capacity" value={mentors.length} hint="Available for CRCS and self-internships" tone="indigo" /></div>
    <Card className="p-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-bold">Find an allocation</h2><p className="mt-1 text-sm text-slate-600">Search by student, roll number, internship, or mentor.</p></div><button type="button" onClick={clearFilters} className="text-sm font-bold text-indigo-700 hover:underline">Reset filters</button></div><div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]"><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search student, roll number, internship, or mentor" /><Select aria-label="Filter by internship type" value={type} onChange={(event) => setType(event.target.value)}><option value="">All internship types</option>{typeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></div><div className="mt-4 flex flex-wrap gap-2"><Button className="px-3 py-2" variant={view === 'waiting' ? 'primary' : 'secondary'} onClick={() => setView('waiting')}>Needs allocation ({waiting.length})</Button><Button className="px-3 py-2" variant={view === 'allocated' ? 'primary' : 'secondary'} onClick={() => setView('allocated')}>Allocated ({allocated.length})</Button><Button className="px-3 py-2" variant={view === 'all' ? 'primary' : 'secondary'} onClick={() => setView('all')}>All records ({mappings.length})</Button></div></Card>
    <div aria-live="polite">{success && <p className="inline-notice border-emerald-200 bg-emerald-50 text-emerald-800">{success}</p>}</div>
    {isLoading && <p className="loading-state">Loading mentor allocations…</p>}{error && <p className="inline-notice border-red-200 bg-red-50 text-red-700">{error.message}</p>}{!isLoading && !error && !mappings.length && <EmptyState title="No approved internships yet" description="Approved CRCS opportunities and self-internships appear here when they are ready for faculty allocation." />}{!isLoading && !error && mappings.length > 0 && !visibleMappings.length && <EmptyState title="No allocations match these filters" description="Try changing the queue or clearing the search filters." action={<Button variant="secondary" onClick={clearFilters}>Reset filters</Button>} />}{!isLoading && !error && visibleMappings.length > 0 && <section className="space-y-3"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-bold">{view === 'waiting' ? 'Students waiting for a mentor' : view === 'allocated' ? 'Allocated students' : 'All mentor records'}</h2><p className="mt-1 text-sm text-slate-600">{visibleMappings.length} record{visibleMappings.length === 1 ? '' : 's'} shown</p>{visibleDepartmentCodes.length > 0 && <p className="mt-1 text-sm text-slate-600">Department: {visibleDepartmentCodes[0]}{visibleDepartmentCodes.length > 1 ? `; additional departments: ${visibleDepartmentCodes.slice(1).join(', ')}` : ''}</p>}</div></div>{visibleMappings.map((mapping) => <AllocationCard key={`${mapping.type}:${mapping.id}`} mapping={mapping} mentors={mentors} canAllocate={canAllocate} onViewStudent={setSelectedStudent} onAllocated={setSuccess} />)}</section>}
    {selectedStudent && <StudentDetailsModal student={selectedStudent} onClose={() => setSelectedStudent(null)} />}
  </div>;
}
