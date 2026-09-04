import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Button } from '../../components/ui/button.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Card } from '../../components/ui/card.jsx';
import { Label } from '../../components/ui/label.jsx';

const PERMISSION_KEYS = ['view_research_approvals', 'view_opportunities', 'view_marks'];

export default function CRCSPermissionsConfig() {
  const [userId, setUserId] = useState('');
  const [granted, setGranted] = useState({});
  const [status, setStatus] = useState(null);

  const submit = useMutation({
    mutationFn: () =>
      api(`/admin/crcs-coordinator-permissions/${userId}`, {
        method: 'PUT',
        body: { permissions: PERMISSION_KEYS.map((key) => ({ permission_key: key, granted: !!granted[key] })) },
      }),
    onSuccess: () => setStatus('Permissions updated.'),
    onError: (err) => setStatus(err.message),
  });

  return (
    <Card className="p-4 max-w-md">
      <h2 className="font-semibold mb-3">CRCS Coordinator Permissions</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate();
        }}
        className="space-y-3"
      >
        <div>
          <Label>Coordinator User ID</Label>
          <Input value={userId} onChange={(e) => setUserId(e.target.value)} required />
        </div>
        {PERMISSION_KEYS.map((key) => (
          <label key={key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!granted[key]}
              onChange={(e) => setGranted((g) => ({ ...g, [key]: e.target.checked }))}
            />
            {key}
          </label>
        ))}
        {status && <p className="text-sm text-slate-600">{status}</p>}
        <Button type="submit" disabled={submit.isPending}>Save Permissions</Button>
      </form>
    </Card>
  );
}
