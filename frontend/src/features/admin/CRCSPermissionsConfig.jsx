import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Button } from '../../components/ui/button.jsx';
import { Card } from '../../components/ui/card.jsx';
import { Label } from '../../components/ui/label.jsx';
import { Select } from '../../components/ui/select.jsx';
import { PageHeader, EmptyState } from '../../components/ui/page.jsx';

const PERMISSION_GROUPS = [
  { title: 'Approvals and opportunities', permissions: [
    ['view_research_approvals', 'Research approvals', 'View and decide research internship applications.'],
    ['view_opportunities', 'CRCS opportunities', 'Post opportunities, manage applicants, assign mentors, and record decisions.'],
  ] },
  { title: 'Programme oversight', permissions: [
    ['view_marks', 'Student marks', 'View programme-wide marks and internship status. Mark overrides remain Superadmin-only.'],
    ['view_student_records', 'Student records and uploads', 'View student records, pathways, uploaded reports, and organisation maps.'],
    ['view_analytics', 'Programme analytics', 'View cycle-level metrics, drill-downs, and exports.'],
  ] },
  { title: 'Operational controls', permissions: [
    ['manage_portal_locks', 'Portal locks and unlock requests', 'Lock or unlock student and faculty workspaces and decide unlock requests.'],
  ] },
];

const PERMISSION_KEYS = PERMISSION_GROUPS.flatMap((group) => group.permissions.map(([key]) => key));

export default function CRCSPermissionsConfig({ embedded = false }) {
  const [userId, setUserId] = useState('');
  const [granted, setGranted] = useState({});
  const [status, setStatus] = useState(null);
  const { data: users = [], isLoading } = useQuery({ queryKey: ['portal-users'], queryFn: () => api('/admin/users') });
  const coordinators = users.filter((user) => user.roles?.some((role) => role.role === 'crcs_coordinator'));
  const permissions = useQuery({ queryKey: ['crcs-coordinator-permissions', userId], queryFn: () => api(`/admin/crcs-coordinator-permissions/${userId}`), enabled: !!userId });

  useEffect(() => {
    setGranted(permissions.data?.permissions ?? {});
    if (userId) setStatus(null);
  }, [permissions.data, userId]);

  const submit = useMutation({
    mutationFn: () => api(`/admin/crcs-coordinator-permissions/${userId}`, { method: 'PUT', body: { permissions: PERMISSION_KEYS.map((key) => ({ permission_key: key, granted: !!granted[key] })) } }),
    onSuccess: () => { setStatus('Permissions updated.'); permissions.refetch(); },
    onError: (err) => setStatus(err.message),
  });
  const selectAll = () => setGranted(Object.fromEntries(PERMISSION_KEYS.map((key) => [key, true])));
  const clearAll = () => setGranted({});

  return (<div className={embedded ? '' : 'max-w-3xl'}>
    {!embedded && <PageHeader eyebrow="Access management" title="Set coordinator access" description="Choose a CRCS Coordinator, then select exactly what they can view and manage. Changes take effect immediately." />}
    {isLoading ? <p className="text-sm text-slate-500">Loading coordinators…</p> : !coordinators.length ? <EmptyState title="No CRCS Coordinator found" description="Create a user with the CRCS Coordinator role first, then return here to grant access." /> : <Card className="p-6">
      <h2 className="font-bold">1. Select a coordinator</h2>
      <form onSubmit={(event) => { event.preventDefault(); submit.mutate(); }} className="space-y-4">
        <div><Label>Coordinator</Label><Select value={userId} onChange={(event) => { setUserId(event.target.value); setGranted({}); }} required><option value="">Choose a coordinator</option>{coordinators.map((user) => <option key={user.id} value={user.id}>{user.full_name} — {user.email}</option>)}</Select><p className="form-help">Permissions are stored independently for each coordinator.</p></div>
        {userId && (permissions.isLoading ? <p className="text-sm text-slate-500">Loading current access…</p> : permissions.error ? <p className="text-sm text-red-700">{permissions.error.message}</p> : <div className="rounded-xl bg-slate-50 p-4"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-bold text-slate-900">2. Choose access</p><div className="flex gap-3 text-sm font-bold"><button type="button" className="text-indigo-700 hover:underline" onClick={selectAll}>Select all</button><button type="button" className="text-indigo-700 hover:underline" onClick={clearAll}>Clear</button></div></div>{PERMISSION_GROUPS.map((group) => <section key={group.title} className="mb-5 last:mb-0"><h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{group.title}</h3><div className="space-y-3">{group.permissions.map(([key, title, description]) => <label key={key} className="flex cursor-pointer items-start gap-3 rounded-lg bg-white p-3 text-sm shadow-sm ring-1 ring-slate-200"><input type="checkbox" checked={!!granted[key]} onChange={(event) => setGranted((current) => ({ ...current, [key]: event.target.checked }))} className="mt-0.5" /><span><span className="block font-semibold text-slate-800">{title}</span><span className="text-xs text-slate-500">{description}</span></span></label>)}</div></section>)}</div>)}
        {status && <p className={`text-sm ${submit.isError ? 'text-red-700' : 'text-emerald-700'}`}>{status}</p>}
        <Button type="submit" disabled={submit.isPending || !userId || permissions.isLoading || permissions.isError}>{submit.isPending ? 'Saving…' : 'Save access settings'}</Button>
      </form>
    </Card>}</div>);
}
