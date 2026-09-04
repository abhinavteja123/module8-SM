import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Card } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Label } from '../../components/ui/label.jsx';
import { Badge } from '../../components/ui/badge.jsx';

export default function SelfInternshipApprovalsPage() {
  const queryClient = useQueryClient();
  const [lookupId, setLookupId] = useState('');
  const [activeId, setActiveId] = useState(null);
  const [reason, setReason] = useState('');

  const { data: internship, refetch, error } = useQuery({
    queryKey: ['self-internship-approval', activeId],
    queryFn: () => api(`/self-internships/${activeId}`),
    enabled: !!activeId,
  });

  const decisionMutation = useMutation({
    mutationFn: (decision) => api(`/self-internships/${activeId}/crcs-decision`, { method: 'PATCH', body: { decision, reason: reason || undefined } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['self-internship-approval', activeId] }),
  });

  return (
    <Card className="p-4 max-w-lg">
      <h2 className="font-medium mb-3">CRCS Self-Internship Approval</h2>
      {/* ponytail: no CRCS-wide list endpoint yet — look up the self-internship by id. */}
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <Label>Self-Internship ID</Label>
          <Input value={lookupId} onChange={(e) => setLookupId(e.target.value)} />
        </div>
        <Button onClick={() => { setActiveId(lookupId); refetch(); }}>Look Up</Button>
      </div>
      {error && <p className="text-sm text-red-600 mt-2">{error.message}</p>}
      {internship && (
        <div className="mt-4 space-y-2 text-sm">
          <p><span className="font-medium">{internship.company_name}</span> <Badge status={internship.status} /></p>
          {internship.status === 'mentor_approved' && (
            <>
              <div>
                <Label>Reason (if rejecting)</Label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <Button onClick={() => decisionMutation.mutate('approve')} disabled={decisionMutation.isPending}>Approve</Button>
                <Button variant="danger" onClick={() => decisionMutation.mutate('reject')} disabled={decisionMutation.isPending}>Reject</Button>
              </div>
            </>
          )}
          {internship.status !== 'mentor_approved' && (
            <p className="text-slate-500">Only mentor-approved self-internships can receive a CRCS decision.</p>
          )}
          {decisionMutation.error && <p className="text-red-600">{decisionMutation.error.message}</p>}
        </div>
      )}
    </Card>
  );
}
