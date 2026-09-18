import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, WarningCircle, ArrowsLeftRight } from '@phosphor-icons/react';
import { api } from '../../lib/api.js';
import { Card } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Label } from '../../components/ui/label.jsx';
import { PageHeader, EmptyState } from '../../components/ui/page.jsx';
import { SkeletonCard } from '../../components/ui/skeleton.jsx';

const breadcrumb = [{ label: 'Home', to: '/coordinator' }, { label: 'Reassign Mentors' }];
const matchesSearch = (text, term) => text.toLowerCase().includes(term.trim().toLowerCase());

// A native <select> only shows its filtered options once clicked open — typing
// in a search box next to it looks like nothing happened. This is a real
// search-as-you-type combobox: the filtered list is visible immediately below
// the input, and picking a row both selects it and closes the list.
function SearchableCombobox({ items, getId, getLabel, getSearchText, value, onChange, placeholder, emptyText, disabled }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selectedItem = items.find((item) => getId(item) === value);
  const filtered = items.filter((item) => !search.trim() || matchesSearch(getSearchText(item), search));
  return <div className="relative">
    <Input
      value={open ? search : (selectedItem ? getLabel(selectedItem) : '')}
      onFocus={() => { setOpen(true); setSearch(''); }}
      onChange={(event) => { setSearch(event.target.value); if (value) onChange(''); }}
      placeholder={placeholder}
      disabled={disabled}
      autoComplete="off"
    />
    {open && <>
      <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
      <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
        {filtered.length ? filtered.map((item) => <button key={getId(item)} type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-indigo-50" onClick={() => { onChange(getId(item)); setOpen(false); setSearch(''); }}>{getLabel(item)}</button>) : <p className="px-3 py-2 text-sm text-slate-500">{emptyText}</p>}
      </div>
    </>}
  </div>;
}

export default function MentorReassignment({ forceFacultyCoordinatorScope = false }) {
  const [assignmentId, setAssignmentId] = useState('');
  const [newFacultyId, setNewFacultyId] = useState('');
  const [reason, setReason] = useState('');
  const queryClient = useQueryClient();
  const actAsQuery = forceFacultyCoordinatorScope ? '?act_as=faculty_coordinator' : '';
  const { data, isLoading, error } = useQuery({ queryKey: ['mentor-assignments', actAsQuery], queryFn: () => api(`/research/mentor-assignments${actAsQuery}`) });
  const { data: history = [] } = useQuery({ queryKey: ['mentor-reassignment-history', actAsQuery], queryFn: () => api(`/research/mentor-reassignment-history${actAsQuery}`), retry: false });
  const reassign = useMutation({ mutationFn: () => api(`/research/mentor-assignments/${assignmentId}/reassign${actAsQuery}`, { method: 'POST', body: { new_faculty_id: newFacultyId, reason } }), onSuccess: () => { setAssignmentId(''); setNewFacultyId(''); setReason(''); queryClient.invalidateQueries({ queryKey: ['mentor-assignments'] }); queryClient.invalidateQueries({ queryKey: ['mentor-reassignment-history'] }); } });
  const selected = data?.assignments?.find((assignment) => assignment.id === assignmentId);
  const availableFaculty = (data?.faculty ?? []).filter((faculty) => faculty.id !== selected?.faculty_id);

  return <div className="max-w-3xl"><PageHeader eyebrow="Faculty support" title="Reassign a student’s mentor" description="Use this when a mentor becomes unavailable. The student’s history is retained and the new mentor can continue their guidance." breadcrumb={breadcrumb} />
    {isLoading ? <SkeletonCard /> : error ? <EmptyState title="Assignments couldn’t be loaded" description="Please refresh the page or ask a CRCS administrator to check your coordinator access." /> : !data?.assignments?.length ? <EmptyState title="No active assignments in your scope" description="Students will appear here after a research internship is approved." /> : <Card className="p-6"><form onSubmit={(event) => { event.preventDefault(); reassign.mutate(); }} className="space-y-5">
      <div><Label>1. Student and current mentor</Label><SearchableCombobox
        items={data.assignments}
        getId={(assignment) => assignment.id}
        getLabel={(assignment) => `${assignment.student?.full_name ?? 'Student'} — currently with ${assignment.faculty?.full_name ?? 'faculty'}`}
        getSearchText={(assignment) => `${assignment.student?.full_name ?? ''} ${assignment.faculty?.full_name ?? ''}`}
        value={assignmentId}
        onChange={(id) => { setAssignmentId(id); setNewFacultyId(''); }}
        placeholder="Search by student or mentor name"
        emptyText="No students match this search"
      /></div>
      <div><Label>2. New mentor</Label><SearchableCombobox
        items={availableFaculty}
        getId={(faculty) => faculty.id}
        getLabel={(faculty) => `${faculty.user?.full_name ?? faculty.id}${faculty.user?.email ? ` — ${faculty.user.email}` : ''}`}
        getSearchText={(faculty) => `${faculty.user?.full_name ?? ''} ${faculty.user?.email ?? ''}`}
        value={newFacultyId}
        onChange={setNewFacultyId}
        placeholder="Search by mentor name or email"
        emptyText="No mentors match this search"
        disabled={!assignmentId}
      /></div>
      <div><Label>3. Why is this changing?</Label><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="For example: mentor is on leave" required /></div>
      {reassign.isError && <p className="flex items-center gap-1.5 text-sm text-red-600"><WarningCircle size={15} weight="fill" />{reassign.error.message}</p>}
      {reassign.isSuccess && <p className="flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle size={15} weight="fill" />Mentor reassigned successfully.</p>}
      <Button type="submit" disabled={reassign.isPending || !assignmentId || !newFacultyId || !reason.trim()}><ArrowsLeftRight size={16} weight="light" />{reassign.isPending ? 'Reassigning…' : 'Confirm mentor reassignment'}</Button>
    </form></Card>}
    <Card className="mt-6 p-6"><h2 className="font-bold">Reassignment history</h2><p className="mt-1 text-sm text-slate-600">Every past mentor hand-off in your scope, who made it, and why — visible to CRCS Superadmin, HOD, and Faculty Coordinator alike.</p>{!history.length ? <p className="mt-4 text-sm text-slate-500">No reassignments yet.</p> : <div className="mt-4 space-y-3">{history.map((item) => <div key={item.id} className="border-b border-slate-100 pb-3 last:border-0"><p className="font-semibold text-slate-900">{item.student?.full_name ?? 'Student'} → {item.new_mentor?.full_name ?? 'New mentor'}</p><p className="text-sm text-slate-600">Reason: {item.reason ?? '—'}</p><p className="text-xs text-slate-500">By {item.reassigned_by?.full_name ?? 'Unknown'} · {new Date(item.started_at).toLocaleString()}</p></div>)}</div>}</Card>
  </div>;
}
