import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Card } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';

export default function OpportunityListPage() {
  const [applied, setApplied] = useState({});
  const { data: opportunities, isLoading, error } = useQuery({
    queryKey: ['opportunities'],
    queryFn: () => api('/opportunities'),
  });

  const applyMutation = useMutation({
    mutationFn: (id) => api(`/opportunities/${id}/apply`, { method: 'POST' }),
    onSuccess: (_data, id) => setApplied((prev) => ({ ...prev, [id]: true })),
  });

  if (isLoading) return <div>Loading opportunities…</div>;
  if (error) return <div className="text-red-600">{error.message}</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">CRCS Opportunities</h1>
      {opportunities?.length === 0 && <p className="text-slate-500 text-sm">No opportunities posted yet.</p>}
      {opportunities?.map((o) => (
        <Card key={o.id} className="p-4">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="font-medium">{o.title}</h2>
              <p className="text-sm text-slate-600">{o.organization_name}</p>
              <p className="text-sm mt-1">{o.description}</p>
              {o.eligibility && <p className="text-xs text-slate-500 mt-1">Eligibility: {o.eligibility}</p>}
              {o.application_deadline && (
                <p className="text-xs text-slate-500">Deadline: {new Date(o.application_deadline).toLocaleDateString()}</p>
              )}
            </div>
            <Button
              disabled={applied[o.id] || applyMutation.isPending}
              onClick={() => applyMutation.mutate(o.id)}
            >
              {applied[o.id] ? 'Applied' : 'Apply'}
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
