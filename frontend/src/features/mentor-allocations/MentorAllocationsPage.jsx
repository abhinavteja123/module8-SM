import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { hasRole } from '../../lib/permissions.js';
import { Card } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Select } from '../../components/ui/select.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { PageHeader, EmptyState } from '../../components/ui/page.jsx';
import StudentDetailsModal from './StudentDetailsModal.jsx';

const typeLabels = { opportunity: 'CRCS opportunity', self_internship: 'Self-internship', research: 'Research internship' };

function Progress({ allocated }) {
  const steps = ['CRCS approval', 'Faculty mentor', 'Student notified', 'Deadlines & reports'];
  return <ol className="mt-4 grid gap-2 sm:grid-cols-4">{steps.map((step, index) => {
    const complete = allocated ? index <= 2 : index === 0;
    const active = allocated ? index === 3 : index === 1;
    return <li key={step} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${complete ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : active ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-200 bg-slate-50 text-slate-500'}`}><span className="mr-1">{complete ? '✓' : index + 1}.</span>{step}</li>;
  })}</ol>;
}

function Hierarchy({ hierarchy }) {
  if (!hierarchy) return <p className="mt-3 text-xs text-slate-500">The selected mentor’s department and leadership hierarchy will be attached automatically.</p>;
  const segments = [
    `Department: ${hierarchy.department?.name ?? 'Not configured'}`,
    `School: ${hierarchy.school?.name ?? 'Not configured'}`,
    `HOD: ${hierarchy.hod?.full_name ?? 'Not configured'}`,
    `Dean: ${hierarchy.dean?.full_name ?? 'Not configured'}`,
  ];
  return <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50 p-3"><p className="text-xs font-bold uppercase tracking-wide text-indigo-700">Automatic academic hierarchy</p><p className="mt-1 text-sm text-indigo-950">{segments.join('  ·  ')}</p></div>;
}

function AllocationRow({ mapping, mentors, canAllocate, onViewStudent }) {
  const queryClient = useQueryClient();
  const [mentorId, setMentorId] = useState(mapping.mentor_id ?? '');
  const [editing, setEditing] = useState(!mapping.mentor);
  const update = useMutation({
    mutationFn: () => api(mapping.type === 'opportunity' ? `/opportunities/applications/${mapping.id}/mentor` : `/self-internships/${mapping.id}/mentor`, { method: 'PATCH', body: { mentor_id: mentorId } }),
    onSuccess: () => { setEditing(false); queryClient.invalidateQueries({ queryKey: ['mentor-allocations'] }); queryClient.invalidateQueries({ queryKey: ['mentor-allocation-options'] }); },
  });
  const canEdit = canAllocate && mapping.type !== 'research';
  const allocated = Boolean(mapping.mentor);
  return <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => onViewStudent(mapping.student)} className="font-bold text-indigo-700 hover:underline focus:outline-none focus:ring-2 focus:ring-indigo-500">{mapping.student?.full_name ?? 'Student'}</button><Badge status={allocated ? 'approved' : 'pending'}>{allocated ? 'mentor allocated' : 'action required'}</Badge></div><p className="mt-1 text-sm text-slate-600">{mapping.student?.email}</p><p className="mt-3 text-sm font-semibold text-slate-900">{typeLabels[mapping.type]} · {mapping.title}</p>{mapping.subtitle && <p className="mt-1 text-xs text-slate-500">{mapping.subtitle}</p>}</div><div className="min-w-56 text-sm"><p className="font-semibold text-slate-900">{allocated ? `Faculty mentor: ${mapping.mentor.full_name}` : 'Waiting for faculty mentor'}</p>{mapping.last_updated_at && <p className="mt-1 text-xs text-slate-500">Assigned by {mapping.last_updated_by?.full_name ?? 'an administrator'} · {new Date(mapping.last_updated_at).toLocaleString()}</p>}<button type="button" onClick={() => onViewStudent(mapping.student)} className="mt-2 text-xs font-semibold text-indigo-700 hover:underline">View student details →</button></div></div>
    <Progress allocated={allocated} />
    {allocated && <Hierarchy hierarchy={mapping.mentor_hierarchy} />}
    {canEdit && editing && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4"><p className="font-semibold text-amber-950">Assign the faculty mentor</p><p className="mt-1 text-sm text-amber-900">Choose only the mentor. The student automatically follows that faculty member’s department, school, HOD, and dean hierarchy.</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><Select value={mentorId} onChange={(event) => setMentorId(event.target.value)}><option value="">Choose faculty mentor</option>{mentors.map((mentor) => <option key={mentor.id} value={mentor.id}>{mentor.full_name} — {mentor.email}</option>)}</Select><Button onClick={() => update.mutate()} disabled={!mentorId || mentorId === mapping.mentor_id || update.isPending}>{update.isPending ? 'Assigning…' : allocated ? 'Save mentor change' : 'Assign mentor and notify student'}</Button><Button variant="ghost" onClick={() => { setMentorId(mapping.mentor_id ?? ''); setEditing(false); }}>Cancel</Button></div>{update.isError && <p className="mt-2 text-sm text-red-700">{update.error.message}</p>}</div>}
    {canEdit && allocated && !editing && <Button variant="secondary" className="mt-4" onClick={() => setEditing(true)}>Change mentor</Button>}
    {mapping.type === 'research' && <p className="mt-4 text-xs text-slate-500">Research mentor changes are managed through Research Mentor Reassignment.</p>}
  </article>;
}

export default function MentorAllocationsPage() {
  const { user } = useAuth();
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [showAllocated, setShowAllocated] = useState(false);
  const canAllocate = hasRole(user, 'crcs_superadmin');
  const { data, isLoading, error } = useQuery({ queryKey: ['mentor-allocations'], queryFn: () => api('/mentor-allocations') });
  const { data: mentors = [] } = useQuery({ queryKey: ['mentor-allocation-options'], queryFn: () => api('/opportunities/mentor-options'), enabled: canAllocate });
  const mappings = data?.mappings ?? [];
  const waiting = mappings.filter((mapping) => !mapping.mentor && mapping.type !== 'research');
  const allocated = mappings.filter((mapping) => mapping.mentor);
  const visibleAllocated = showAllocated ? allocated : allocated.slice(0, 5);
  return <div className="max-w-5xl space-y-6"><PageHeader eyebrow="Mentor management" title="Mentor allocations" description={canAllocate ? 'After CRCS approval, assign one faculty mentor. The student is notified immediately; hierarchy, deadlines, report access, and deadline reminders then follow automatically.' : 'Review the post-approval mentor assignments available within your role and scope.'} />
    <Card className="p-5"><h2 className="font-bold">What happens after CRCS approval?</h2><ol className="mt-3 grid gap-3 text-sm sm:grid-cols-4"><li><strong>1. Approval</strong><br /><span className="text-slate-600">CRCS approves the internship.</span></li><li><strong>2. Assign mentor</strong><br /><span className="text-slate-600">Choose one eligible faculty mentor.</span></li><li><strong>3. Notify student</strong><br /><span className="text-slate-600">The student sees the mentor and approved details.</span></li><li><strong>4. Start supervision</strong><br /><span className="text-slate-600">The mentor sets deadlines; students receive a reminder 48 hours before each due date.</span></li></ol><p className="mt-4 rounded-lg bg-indigo-50 p-3 text-sm text-indigo-950"><strong>No manual hierarchy setup is needed.</strong> The mentor’s department, school, HOD, and dean are inherited automatically from the organisation structure.</p></Card>
    <div className="grid gap-4 sm:grid-cols-3"><Card className="p-5"><p className="text-sm font-semibold text-slate-600">Needs mentor allocation</p><p className="mt-1 text-3xl font-bold text-amber-700">{waiting.length}</p></Card><Card className="p-5"><p className="text-sm font-semibold text-slate-600">Ready for supervision</p><p className="mt-1 text-3xl font-bold text-emerald-700">{allocated.length}</p></Card><Card className="p-5"><p className="text-sm font-semibold text-slate-600">Visible internship mappings</p><p className="mt-1 text-3xl font-bold text-slate-950">{mappings.length}</p></Card></div>
    {isLoading && <p className="loading-state">Loading mentor allocations…</p>}{error && <p className="inline-notice border-red-200 bg-red-50 text-red-700">{error.message}</p>}{!isLoading && !error && !mappings.length && <EmptyState title="No approved internships yet" description="Approved CRCS opportunities and self-internships appear here when they are ready for faculty allocation." />}
    {!isLoading && !error && waiting.length > 0 && <section className="space-y-3"><div><h2 className="text-lg font-bold">Action required</h2><p className="mt-1 text-sm text-slate-600">These students are approved and waiting for their faculty mentor.</p></div>{waiting.map((mapping) => <AllocationRow key={`${mapping.type}:${mapping.id}`} mapping={mapping} mentors={mentors} canAllocate={canAllocate} onViewStudent={setSelectedStudent} />)}</section>}
    {!isLoading && !error && allocated.length > 0 && <section className="space-y-3"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-bold">Mentors already allocated</h2><p className="mt-1 text-sm text-slate-600">These students can proceed with mentor-set deadlines and report submissions.</p></div>{allocated.length > 5 && <Button variant="secondary" onClick={() => setShowAllocated((value) => !value)}>{showAllocated ? 'Show less' : `Show all ${allocated.length}`}</Button>}</div>{visibleAllocated.map((mapping) => <AllocationRow key={`${mapping.type}:${mapping.id}`} mapping={mapping} mentors={mentors} canAllocate={canAllocate} onViewStudent={setSelectedStudent} />)}</section>}
    {selectedStudent && <StudentDetailsModal student={selectedStudent} onClose={() => setSelectedStudent(null)} />}
  </div>;
}
