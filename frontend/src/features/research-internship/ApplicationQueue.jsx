import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Card } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Badge } from '../../components/ui/badge.jsx';

function DecisionRow({ app, onDecide }) {
  const [reason, setReason] = useState('');
  return (
    <div className="flex items-center justify-between border-t border-slate-100 py-2 first:border-t-0">
      <div>
        <p className="text-sm font-medium">Student {app.student_id}</p>
        <Badge status={app.status} />
      </div>
      <div className="flex items-center gap-2">
        <Input placeholder="Reason (required to reject)" value={reason} onChange={(e) => setReason(e.target.value)} className="w-48" />
        <Button variant="secondary" onClick={() => onDecide(app.id, 'approve', reason)}>Approve</Button>
        <Button variant="danger" onClick={() => onDecide(app.id, 'reject', reason)} disabled={!reason}>Reject</Button>
      </div>
    </div>
  );
}

// ponytail: no list-applications-by-status endpoint exists on the backend yet — this reads
// an `applications` array nested on each project from GET /research/projects if the API
// returns one; if it doesn't, the queue renders empty per project. Add a dedicated
// GET /research/applications?status= endpoint if this gap needs closing.
export default function ApplicationQueue({ stage }) {
  const queryClient = useQueryClient();
  const { data: projects, isLoading, error } = useQuery({
    queryKey: ['research-projects'],
    queryFn: () => api('/research/projects'),
  });

  const decide = useMutation({
    mutationFn: ({ id, decision, reason }) =>
      api(`/research/applications/${id}/${stage === 'faculty' ? 'faculty-decision' : 'crcs-decision'}`, {
        method: 'PATCH',
        body: { decision, reason: reason || undefined },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['research-projects'] }),
  });

  if (isLoading) return <p>Loading…</p>;
  if (error) return <p className="text-red-600">{error.message}</p>;

  const relevantStatus = stage === 'faculty' ? 'pending_faculty' : 'pending_crcs_approval';

  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-lg font-semibold">{stage === 'faculty' ? 'Faculty' : 'CRCS'} Application Queue</h1>
      {(projects ?? []).map((p) => {
        const pending = (p.applications ?? []).filter((a) => a.status === relevantStatus);
        if (!pending.length) return null;
        return (
          <Card key={p.id} className="p-4">
            <h2 className="font-medium mb-2">{p.title}</h2>
            {pending.map((app) => (
              <DecisionRow key={app.id} app={app} onDecide={(id, decision, reason) => decide.mutate({ id, decision, reason })} />
            ))}
          </Card>
        );
      })}
      {(projects ?? []).every((p) => !(p.applications ?? []).some((a) => a.status === relevantStatus)) && (
        <p className="text-sm text-slate-500">No pending applications.</p>
      )}
      {decide.isError && <p className="text-sm text-red-600">{decide.error.message}</p>}
    </div>
  );
}
