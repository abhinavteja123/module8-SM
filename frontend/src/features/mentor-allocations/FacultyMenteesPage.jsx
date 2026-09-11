import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Button } from '../../components/ui/button.jsx';
import { Card } from '../../components/ui/card.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Select } from '../../components/ui/select.jsx';
import { EmptyState, PageHeader } from '../../components/ui/page.jsx';
import AttendanceBadge from '../../components/AttendanceBadge.jsx';
import StudentDetailsModal from './StudentDetailsModal.jsx';

function ReassignForm({ mapping, options, onDone }) {
  const queryClient = useQueryClient();
  const [newFacultyId, setNewFacultyId] = useState('');
  const [reason, setReason] = useState('');
  const isResearch = mapping.type === 'research';
  const reassign = useMutation({
    mutationFn: () => isResearch
      ? api(`/research/mentor-assignments/${mapping.id}/reassign`, { method: 'POST', body: { new_faculty_id: newFacultyId, reason } })
      : api(mapping.type === 'opportunity' ? `/opportunities/applications/${mapping.id}/mentor` : `/self-internships/${mapping.id}/mentor`, { method: 'PATCH', body: { mentor_id: newFacultyId } }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['mentor-allocations'] }); onDone(); },
  });
  return <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
    <div><label className="text-xs font-semibold text-slate-600">Hand off to</label><Select className="mt-1" value={newFacultyId} onChange={(event) => setNewFacultyId(event.target.value)}><option value="">Choose a faculty mentor</option>{options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</Select></div>
    {isResearch && <div><label className="text-xs font-semibold text-slate-600">Reason</label><Input className="mt-1" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="For example: going on leave" /></div>}
    <div className="flex items-center gap-2"><Button className="px-3 py-2 text-xs" onClick={() => reassign.mutate()} disabled={!newFacultyId || (isResearch && !reason.trim()) || reassign.isPending}>{reassign.isPending ? 'Saving…' : 'Confirm hand-off'}</Button><Button variant="ghost" className="px-3 py-2 text-xs" onClick={onDone}>Cancel</Button></div>
    {reassign.isError && <p className="text-xs text-red-600">{reassign.error.message}</p>}
  </div>;
}

function AttendanceMarker({ mapping }) {
  const queryClient = useQueryClient();
  const [present, setPresent] = useState(true);
  const relatedEntityType = mapping.type === 'research' ? 'research_application' : mapping.type === 'opportunity' ? 'opportunity_application' : 'self_internship';
  const { data: attendance } = useQuery({ queryKey: ['attendance', mapping.student_id], queryFn: () => api(`/attendance/${mapping.student_id}`), retry: false });
  const totalWeeks = attendance?.total_weeks ?? 16;
  const statusByWeek = new Map((attendance?.weeks ?? []).map((item) => [item.week_number, item.present]));
  const firstUnmarked = Array.from({ length: totalWeeks }, (_, i) => i + 1).find((w) => !statusByWeek.has(w)) ?? 1;
  const [week, setWeek] = useState(firstUnmarked);
  const mark = useMutation({
    mutationFn: () => api('/attendance', { method: 'PUT', body: { student_id: mapping.student_id, related_entity_type: relatedEntityType, related_entity_id: mapping.id, week_number: Number(week), present } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attendance', mapping.student_id] }),
  });
  return <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
    <div><label className="text-xs font-semibold text-slate-600">Week (cycle runs {totalWeeks} weeks)</label><Select aria-label="Week" className="mt-1 w-40" value={week} onChange={(event) => setWeek(Number(event.target.value))}>{Array.from({ length: totalWeeks }, (_, i) => i + 1).map((w) => <option key={w} value={w}>Week {w}{statusByWeek.has(w) ? ` — marked ${statusByWeek.get(w) ? 'present' : 'absent'}` : ''}</option>)}</Select></div>
    <Select aria-label="Attendance status" className="w-32" value={present ? 'present' : 'absent'} onChange={(event) => setPresent(event.target.value === 'present')}><option value="present">Present</option><option value="absent">Absent</option></Select>
    <Button className="px-3 py-2 text-xs" onClick={() => mark.mutate()} disabled={mark.isPending}>{mark.isPending ? 'Saving…' : 'Mark week'}</Button>
    {mark.isError && <p className="text-xs text-red-600">{mark.error.message}</p>}
  </div>;
}

export default function FacultyMenteesPage() {
  const [projectKey, setProjectKey] = useState('');
  const [search, setSearch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [reassigningKey, setReassigningKey] = useState(null);
  const { data, isLoading, error } = useQuery({ queryKey: ['mentor-allocations'], queryFn: () => api('/mentor-allocations') });
  const { data: researchOptions } = useQuery({ queryKey: ['research-mentor-assignments'], queryFn: () => api('/research/mentor-assignments') });
  const { data: mentorOptions = [] } = useQuery({ queryKey: ['mentor-options'], queryFn: () => api('/opportunities/mentor-options') });
  const mappings = data?.mappings ?? [];
  const projects = useMemo(() => [...new Map(mappings.map((mapping) => [mapping.title, mapping.title])).keys()].sort(), [mappings]);
  const filtered = mappings.filter((mapping) => (!projectKey || mapping.title === projectKey) && (!search.trim() || [mapping.student?.full_name, mapping.student?.email, mapping.student?.roll_number].filter(Boolean).join(' ').toLowerCase().includes(search.trim().toLowerCase())));
  const optionsFor = (mapping) => (mapping.type === 'research'
    ? (researchOptions?.faculty ?? []).map((item) => ({ id: item.id, label: item.user?.full_name ?? item.user?.email ?? item.id }))
    : mentorOptions.map((item) => ({ id: item.id, label: `${item.full_name} — ${item.active_allocations ?? 0}/${item.allocation_limit ?? 5} students` }))
  ).filter((option) => option.id !== mapping.mentor_id);

  if (isLoading) return <div className="loading-state">Loading your mentored students…</div>;
  if (error) return <div className="inline-notice border-red-200 bg-red-50 text-red-700">{error.message}</div>;

  return <div className="max-w-5xl space-y-6"><PageHeader eyebrow="Student supervision" title="My mentored students" description="Choose a project or internship to see every student allocated to you, their full details, and weekly attendance." />
    <Card className="p-5"><div className="grid gap-3 sm:grid-cols-2"><div><label className="text-sm font-semibold text-slate-800">Project / internship</label><Select className="mt-2" value={projectKey} onChange={(event) => setProjectKey(event.target.value)}><option value="">All projects ({mappings.length} students)</option>{projects.map((title) => <option key={title} value={title}>{title}</option>)}</Select></div><div><label className="text-sm font-semibold text-slate-800">Search</label><Input className="mt-2" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search student, email, or roll number" /></div></div></Card>
    {!mappings.length && <EmptyState title="No mentored students yet" description="Students you are assigned to mentor will appear here." />}
    {mappings.length > 0 && !filtered.length && <EmptyState title="No students match this filter" description="Try another project or clear the search." />}
    {filtered.length > 0 && <div className="space-y-4">{filtered.map((mapping) => { const student = mapping.student ?? {}; const key = `${mapping.type}:${mapping.id}`; const options = optionsFor(mapping); return <Card key={key} className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0"><button type="button" onClick={() => setSelectedStudent(student)} className="font-bold text-indigo-700 hover:underline">{student.full_name ?? 'Student'}</button><p className="mt-1 text-sm text-slate-600">{student.email}</p><p className="mt-1 text-xs text-slate-500">{student.roll_number ?? 'Roll number not provided'}{student.department?.name ? ` · ${student.department.name}` : ''}</p><p className="mt-1 text-xs font-medium text-indigo-700">{mapping.title}</p></div>
        <div className="flex flex-wrap items-center gap-2"><AttendanceBadge studentId={mapping.student_id} /><Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => setSelectedStudent(student)}>Full details</Button>{options.length > 0 && <Button variant="ghost" className="px-3 py-1.5 text-xs text-indigo-700" onClick={() => setReassigningKey(reassigningKey === key ? null : key)}>Reassign to another faculty</Button>}</div>
      </div>
      <AttendanceMarker mapping={mapping} />
      {reassigningKey === key && <ReassignForm mapping={mapping} options={options} onDone={() => setReassigningKey(null)} />}
    </Card>; })}</div>}
    {selectedStudent && <StudentDetailsModal student={selectedStudent} onClose={() => setSelectedStudent(null)} />}
  </div>;
}
