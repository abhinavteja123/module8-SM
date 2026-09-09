import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Badge } from '../../components/ui/badge.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Card } from '../../components/ui/card.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Label } from '../../components/ui/label.jsx';
import { PageHeader, EmptyState } from '../../components/ui/page.jsx';
import { Select } from '../../components/ui/select.jsx';

function lockKey(type, id) { return `${type}:${id}`; }

function LockRow({ person, type, lock, onChange, busy }) {
  const [reason, setReason] = useState('');
  const locked = Boolean(lock?.is_locked);
  return <div className="flex flex-col gap-3 border-b border-slate-100 py-4 last:border-0 md:flex-row md:items-center">
    <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate font-semibold text-slate-900">{person.full_name}</p><Badge status={locked ? 'rejected' : 'approved'}>{locked ? 'Locked' : 'Open'}</Badge></div><p className="mt-1 truncate text-sm text-slate-500">{person.email}{person.roll_number ? ` · ${person.roll_number}` : ''}</p>{locked && <p className="mt-1 text-xs text-amber-700">{lock.reason || 'No reason recorded'} · locked {new Date(lock.locked_at).toLocaleString()}</p>}</div>
    <div className="flex w-full gap-2 md:w-auto"><Input aria-label={`Reason for ${person.full_name}`} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} placeholder={locked ? 'Unlock reason (optional)' : 'Lock reason (optional)'} /><Button variant={locked ? 'secondary' : 'destructive'} disabled={busy} onClick={() => onChange(!locked, reason)}>{busy ? 'Saving…' : locked ? 'Unlock' : 'Lock'}</Button></div>
  </div>;
}

export default function LockManagement() {
  const queryClient = useQueryClient();
  const [scope, setScope] = useState('student_portal');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState(null);
  const { data, isLoading, error } = useQuery({ queryKey: ['portal-locks'], queryFn: () => api('/admin/locks') });
  const { data: auditRows = [] } = useQuery({ queryKey: ['portal-lock-audit'], queryFn: () => api('/admin/locks/audit') });
  const { data: unlockRequests = [] } = useQuery({ queryKey: ['portal-unlock-requests'], queryFn: () => api('/admin/unlock-requests') });
  const decideRequest = useMutation({
    mutationFn: ({ id, decision }) => api(`/admin/unlock-requests/${id}`, { method: 'PATCH', body: { decision } }),
    onSuccess: () => { setMessage('Unlock request decided.'); queryClient.invalidateQueries({ queryKey: ['portal-unlock-requests'] }); queryClient.invalidateQueries({ queryKey: ['portal-locks'] }); queryClient.invalidateQueries({ queryKey: ['portal-lock-audit'] }); },
    onError: (failure) => setMessage(failure.message),
  });
  const locks = useMemo(() => Object.fromEntries((data?.locks ?? []).map((lock) => [lockKey(lock.lock_type, lock.subject_id), lock])), [data]);
  const mutation = useMutation({
    mutationFn: ({ type, id, locked, reason }) => api(`/admin/locks/${type}/${id}`, { method: 'PATCH', body: { locked, reason: reason || undefined } }),
    onSuccess: (_result, variables) => { setMessage(variables.locked ? 'Lock applied and written to the audit history.' : 'Lock removed and written to the audit history.'); queryClient.invalidateQueries({ queryKey: ['portal-locks'] }); queryClient.invalidateQueries({ queryKey: ['portal-lock-audit'] }); },
    onError: (failure) => setMessage(failure.message),
  });
  const people = scope === 'student_portal' ? data?.students ?? [] : data?.faculty ?? [];
  const visible = people.filter((person) => `${person.full_name} ${person.email} ${person.roll_number ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="max-w-5xl"><PageHeader eyebrow="CRCS controls" title="Portal locks" description="Lock individual student portals or controlled parts of a faculty workspace. CRCS is system-wide; HODs and Faculty Coordinators only manage their own department." />
    <Card className="p-5"><div className="grid gap-3 sm:grid-cols-2"><div><Label>Control</Label><Select value={scope} onChange={(event) => setScope(event.target.value)}><option value="student_portal">Student portal</option><option value="faculty_projects">Faculty project names and applications</option><option value="faculty_assignments">Faculty assignments and deadlines</option><option value="faculty_marks">Faculty marks</option></Select></div><div><Label>Find a person</Label><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, email, or roll number" /></div></div>
      <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{scope === 'student_portal' ? 'A locked student can still view their information, but cannot update their profile, preference, applications, uploads, or certificate.' : scope === 'faculty_projects' ? 'A locked faculty member cannot change project names/details, decide applications, or accept new project applications.' : scope === 'faculty_assignments' ? 'A locked faculty member cannot set deadlines, mark attendance, or review student documents.' : 'A locked faculty member cannot enter or amend student marks.'}</p>
      {message && <p role="status" className="mt-3 text-sm text-slate-700">{message}</p>}
      {isLoading ? <p className="mt-5 text-sm text-slate-500">Loading lock controls…</p> : error ? <p className="mt-5 text-sm text-red-600">{error.message}</p> : !visible.length ? <div className="mt-5"><EmptyState title="No matching people" description="Try a different search." /></div> : <div className="mt-4">{visible.map((person) => { const type = scope; const lock = locks[lockKey(type, person.id)]; return <LockRow key={person.id} person={person} type={type} lock={lock} busy={mutation.isPending && mutation.variables?.id === person.id && mutation.variables?.type === type} onChange={(locked, reason) => mutation.mutate({ type, id: person.id, locked, reason })} />; })}</div>}
    </Card>
    <Card className="mt-5 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold text-slate-950">Unlock requests</h2><p className="mt-1 text-sm text-slate-600">Students and faculty must explain why a locked area needs to be reopened.</p></div><Badge status="pending">{unlockRequests.length} pending</Badge></div>{!unlockRequests.length ? <p className="mt-4 text-sm text-slate-500">No unlock requests are waiting.</p> : <div className="mt-4 space-y-3">{unlockRequests.map((request) => <div key={request.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold text-slate-900">{request.requester?.full_name ?? 'Portal user'}</p><p className="text-xs text-slate-500">{request.requester?.email} · {request.portal_locks?.lock_type?.replaceAll('_', ' ')}</p></div><p className="text-xs text-slate-500">{new Date(request.created_at).toLocaleString()}</p></div><p className="mt-3 text-sm text-slate-700">{request.reason}</p><div className="mt-3 flex gap-2"><Button type="button" variant="secondary" disabled={decideRequest.isPending} onClick={() => decideRequest.mutate({ id: request.id, decision: 'reject' })}>Reject</Button><Button type="button" disabled={decideRequest.isPending} onClick={() => decideRequest.mutate({ id: request.id, decision: 'approve' })}>Approve & unlock</Button></div></div>)}</div>}</Card>
    <Card className="mt-5 p-5"><h2 className="font-bold text-slate-950">Lock and unlock history</h2><p className="mt-1 text-sm text-slate-600">The latest 200 CRCS lock changes. The audit entry keeps the previous and resulting state.</p>{!auditRows.length ? <p className="mt-4 text-sm text-slate-500">No lock changes have been recorded yet.</p> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><tr><th className="pb-2 pr-4">When</th><th className="pb-2 pr-4">By</th><th className="pb-2 pr-4">Action</th><th className="pb-2 pr-4">Target</th><th className="pb-2">Reason</th></tr></thead><tbody>{auditRows.map((entry) => <tr key={entry.id} className="border-b border-slate-100 last:border-0"><td className="py-3 pr-4 whitespace-nowrap text-slate-600">{new Date(entry.created_at).toLocaleString()}</td><td className="py-3 pr-4 text-slate-600">{entry.actor?.full_name || 'CRCS user'}</td><td className="py-3 pr-4 font-medium text-slate-900">{entry.action.replaceAll('_', ' ')}</td><td className="py-3 pr-4 text-slate-600">{entry.new_value?.lock_type === 'student_portal' ? 'Student portal' : 'Faculty projects'}</td><td className="py-3 text-slate-600">{entry.new_value?.reason || '—'}</td></tr>)}</tbody></table></div>}</Card>
  </div>;
}
