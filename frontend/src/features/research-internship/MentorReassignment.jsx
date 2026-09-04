import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Card } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Label } from '../../components/ui/label.jsx';

// ponytail: no endpoint lists mentor_assignments by department, so the coordinator
// enters the mentor_assignment_id directly (visible on the student's research dashboard
// or via the audit log). Add a lookup list once GET /research/mentor-assignments exists.
export default function MentorReassignment() {
  const [assignmentId, setAssignmentId] = useState('');
  const [newFacultyId, setNewFacultyId] = useState('');
  const [reason, setReason] = useState('');

  const reassign = useMutation({
    mutationFn: () =>
      api(`/research/mentor-assignments/${assignmentId}/reassign`, {
        method: 'POST',
        body: { new_faculty_id: newFacultyId, reason },
      }),
  });

  return (
    <Card className="max-w-lg p-6">
      <h1 className="text-lg font-semibold mb-1">Mentor Reassignment</h1>
      <p className="text-sm text-slate-500 mb-4">Reassign a student to a new mentor (leave, unavailability, etc).</p>
      <div className="space-y-3">
        <div>
          <Label>Mentor Assignment ID</Label>
          <Input value={assignmentId} onChange={(e) => setAssignmentId(e.target.value)} placeholder="UUID" />
        </div>
        <div>
          <Label>New Faculty ID</Label>
          <Input value={newFacultyId} onChange={(e) => setNewFacultyId(e.target.value)} placeholder="UUID" />
        </div>
        <div>
          <Label>Reason</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. mentor on leave" />
        </div>
        <Button onClick={() => reassign.mutate()} disabled={reassign.isPending || !assignmentId || !newFacultyId}>
          Reassign
        </Button>
        {reassign.isSuccess && <p className="text-sm text-green-700">Reassigned.</p>}
        {reassign.isError && <p className="text-sm text-red-600">{reassign.error.message}</p>}
      </div>
    </Card>
  );
}
