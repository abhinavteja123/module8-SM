import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Button } from '../../components/ui/button.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Card } from '../../components/ui/card.jsx';
import { Label } from '../../components/ui/label.jsx';
import { Select } from '../../components/ui/select.jsx';
import { PageHeader, EmptyState } from '../../components/ui/page.jsx';

const PERMISSION_KEYS = ['view_research_approvals', 'view_opportunities', 'view_marks'];

export default function CRCSPermissionsConfig({ embedded = false }) {
  const [userId, setUserId] = useState('');
  const [granted, setGranted] = useState({});
  const [status, setStatus] = useState(null);
  const { data: users = [], isLoading } = useQuery({ queryKey: ['portal-users'], queryFn: () => api('/admin/users') });
  const coordinators = users.filter((user) => user.roles?.some((role) => role.role === 'crcs_coordinator'));

  const submit = useMutation({
    mutationFn: () =>
      api(`/admin/crcs-coordinator-permissions/${userId}`, {
        method: 'PUT',
        body: { permissions: PERMISSION_KEYS.map((key) => ({ permission_key: key, granted: !!granted[key] })) },
      }),
    onSuccess: () => setStatus('Permissions updated.'),
    onError: (err) => setStatus(err.message),
  });

  return (<div className={embedded ? '' : 'max-w-2xl'}>
    {!embedded && <PageHeader eyebrow="Access management" title="Set coordinator access" description="Choose a CRCS Coordinator, then select exactly what they can see and act on. Changes take effect immediately." />}
    {isLoading ? <p className="text-sm text-slate-500">Loading coordinators…</p> : !coordinators.length ? <EmptyState title="No CRCS Coordinator found" description="Create a user with the CRCS Coordinator role first, then return here to grant access." /> : <Card className="p-6">
      <h2 className="font-bold">1. Select a coordinator</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate();
        }}
        className="space-y-3"
      >
        <div>
          <Label>Coordinator</Label>
          <Select value={userId} onChange={(e) => setUserId(e.target.value)} required><option value="">Choose a coordinator</option>{coordinators.map((user) => <option key={user.id} value={user.id}>{user.full_name} — {user.email}</option>)}</Select>
          <p className="form-help">You no longer need to copy a technical user ID.</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-4"><p className="mb-3 text-sm font-bold text-slate-900">2. Choose access</p>
        {PERMISSION_KEYS.map((key) => (
          <label key={key} className="mb-3 flex items-center gap-3 text-sm last:mb-0">
            <input
              type="checkbox"
              checked={!!granted[key]}
              onChange={(e) => setGranted((g) => ({ ...g, [key]: e.target.checked }))}
            />
            <span><span className="block font-semibold text-slate-800">{key === 'view_research_approvals' ? 'Research approvals' : key === 'view_opportunities' ? 'CRCS opportunities' : 'Student marks'}</span><span className="text-xs text-slate-500">{key === 'view_research_approvals' ? 'View and decide research applications.' : key === 'view_opportunities' ? 'Manage opportunity applicants and decisions.' : 'View student marks.'}</span></span>
          </label>
        ))}</div>
        {status && <p className="text-sm text-slate-600">{status}</p>}
        <Button type="submit" disabled={submit.isPending || !userId}>{submit.isPending ? 'Saving…' : 'Save access settings'}</Button>
      </form>
    </Card>}</div>);
}
