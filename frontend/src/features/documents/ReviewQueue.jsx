import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Button } from '../../components/ui/button.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Card } from '../../components/ui/card.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Label } from '../../components/ui/label.jsx';

// ponytail: no "my mentees" list endpoint exists yet — faculty enters a student_id manually.
export default function ReviewQueue() {
  const [studentId, setStudentId] = useState('');
  const [comment, setComment] = useState('');
  const qc = useQueryClient();

  const { data: docs, isLoading, refetch } = useQuery({
    queryKey: ['review-docs', studentId],
    queryFn: () => api(`/documents?student_id=${studentId}`),
    enabled: false,
  });

  const review = useMutation({
    mutationFn: ({ id, review_status }) =>
      api(`/documents/${id}/review`, { method: 'PATCH', body: { review_status, review_comment: comment || undefined } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['review-docs', studentId] }),
  });

  return (
    <div className="space-y-4 max-w-2xl">
      <Card className="p-4">
        <Label>Student ID</Label>
        <div className="flex gap-2">
          <Input value={studentId} onChange={(e) => setStudentId(e.target.value)} />
          <Button onClick={() => refetch()} disabled={!studentId}>Load</Button>
        </div>
      </Card>

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}

      <Card className="p-4 space-y-3">
        {docs?.map((d) => (
          <div key={d.id} className="border-b border-slate-100 pb-3 text-sm space-y-1">
            <div className="flex items-center justify-between">
              <span>{d.file_name}</span>
              <Badge status={d.review_status}>{d.review_status}</Badge>
            </div>
            <Input placeholder="Comment (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
            <div className="flex gap-2">
              <Button variant="primary" onClick={() => review.mutate({ id: d.id, review_status: 'verified' })}>Verify</Button>
              <Button variant="secondary" onClick={() => review.mutate({ id: d.id, review_status: 'revision_requested' })}>Request Revision</Button>
            </div>
          </div>
        ))}
        {docs && !docs.length && <p className="text-sm text-slate-500">No documents for this student.</p>}
      </Card>
    </div>
  );
}
