import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Card } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Select } from '../../components/ui/select.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Label } from '../../components/ui/label.jsx';
import { PageHeader, EmptyState } from '../../components/ui/page.jsx';

export default function MentorReassignment() {
  const [assignmentId, setAssignmentId] = useState('');
  const [newFacultyId, setNewFacultyId] = useState('');
  const [reason, setReason] = useState('');
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['mentor-assignments'], queryFn: () => api('/research/mentor-assignments') });
  const reassign = useMutation({ mutationFn: () => api(`/research/mentor-assignments/${assignmentId}/reassign`, { method: 'POST', body: { new_faculty_id: newFacultyId, reason } }), onSuccess: () => { setAssignmentId(''); setNewFacultyId(''); setReason(''); queryClient.invalidateQueries({ queryKey: ['mentor-assignments'] }); } });
  const selected = data?.assignments?.find((assignment) => assignment.id === assignmentId);
  const availableFaculty = (data?.faculty ?? []).filter((faculty) => faculty.id !== selected?.faculty_id);

  return <div className="max-w-3xl"><PageHeader eyebrow="Faculty support" title="Reassign a student’s mentor" description="Use this when a mentor becomes unavailable. The student’s history is retained and the new mentor can continue their guidance." />
    {isLoading ? <p className="text-sm text-slate-500">Loading assignments…</p> : error ? <EmptyState title="Assignments couldn’t be loaded" description="Please refresh the page or ask a CRCS administrator to check your coordinator access." /> : !data?.assignments?.length ? <EmptyState title="No active assignments in your scope" description="Students will appear here after a research internship is approved." /> : <Card className="p-6"><form onSubmit={(event) => { event.preventDefault(); reassign.mutate(); }} className="space-y-5"><div><Label>1. Student and current mentor</Label><Select value={assignmentId} onChange={(event) => { setAssignmentId(event.target.value); setNewFacultyId(''); }} required><option value="">Choose an assignment</option>{data.assignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.student?.full_name ?? 'Student'} — currently with {assignment.faculty?.full_name ?? 'faculty'}</option>)}</Select></div><div><Label>2. New mentor</Label><Select value={newFacultyId} onChange={(event) => setNewFacultyId(event.target.value)} required disabled={!assignmentId}><option value="">Choose a new mentor</option>{availableFaculty.map((faculty) => <option key={faculty.id} value={faculty.id}>{faculty.user?.full_name ?? faculty.id} {faculty.user?.email ? `— ${faculty.user.email}` : ''}</option>)}</Select></div><div><Label>3. Why is this changing?</Label><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="For example: mentor is on leave" required /></div>{reassign.isError && <p className="text-sm text-red-600">{reassign.error.message}</p>}{reassign.isSuccess && <p className="text-sm text-emerald-700">Mentor reassigned successfully.</p>}<Button type="submit" disabled={reassign.isPending || !assignmentId || !newFacultyId || !reason.trim()}>{reassign.isPending ? 'Reassigning…' : 'Confirm mentor reassignment'}</Button></form></Card>}</div>;
}
