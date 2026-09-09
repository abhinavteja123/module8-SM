import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Button } from '../../components/ui/button.jsx';
import { Card } from '../../components/ui/card.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Label } from '../../components/ui/label.jsx';
import { Select } from '../../components/ui/select.jsx';

const labels = { student_portal: 'Student portal', faculty_projects: 'Project names and applications', faculty_assignments: 'Assignments and deadlines', faculty_marks: 'Marks' };

export default function UnlockRequestPanel() {
  const queryClient = useQueryClient();
  const [lockId, setLockId] = useState('');
  const [reason, setReason] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['my-active-locks'], queryFn: () => api('/admin/locks/me'), retry: false });
  const locks = data?.locks ?? [];
  const requests = data?.requests ?? [];
  const selectedLockId = lockId || locks[0]?.id || '';
  const pendingLockIds = new Set(requests.filter((request) => request.status === 'pending').map((request) => request.lock_id));
  const submit = useMutation({
    mutationFn: () => api(`/admin/locks/${selectedLockId}/unlock-requests`, { method: 'POST', body: { reason } }),
    onSuccess: () => { setReason(''); queryClient.invalidateQueries({ queryKey: ['my-active-locks'] }); },
  });
  if (isLoading || !locks.length) return null;
  const selected = locks.find((lock) => lock.id === selectedLockId);
  return <Card className="border-amber-200 bg-amber-50 p-5"><p className="text-xs font-bold uppercase tracking-widest text-amber-700">Access locked</p><h2 className="mt-1 font-bold text-amber-950">Request an exception</h2><p className="mt-1 text-sm leading-5 text-amber-900">Your changes are protected by a CRCS or department lock. Explain what you need to correct; CRCS, your HOD, or Faculty Coordinator will review the request.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><div><Label>Locked area</Label><Select value={selectedLockId} onChange={(event) => setLockId(event.target.value)}>{locks.map((lock) => <option key={lock.id} value={lock.id}>{labels[lock.lock_type] ?? lock.lock_type}</option>)}</Select></div><div><Label>Lock reason</Label><Input value={selected?.reason ?? 'No reason recorded'} disabled /></div></div><div className="mt-3"><Label>Why do you need an unlock?</Label><Input value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} maxLength={1000} placeholder="Describe the correction you need to make" /></div>{pendingLockIds.has(selectedLockId) ? <p className="mt-3 text-sm font-medium text-amber-800">An unlock request for this area is already waiting for a decision.</p> : <Button className="mt-4" type="button" onClick={() => submit.mutate()} disabled={submit.isPending || reason.trim().length < 3}>{submit.isPending ? 'Sending…' : 'Request unlock'}</Button>}{submit.isError && <p className="mt-3 text-sm text-red-700">{submit.error.message}</p>}{submit.isSuccess && <p className="mt-3 text-sm text-emerald-800">Your request was sent for review.</p>}</Card>;
}
