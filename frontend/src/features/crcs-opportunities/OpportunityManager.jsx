import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Card } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Label } from '../../components/ui/label.jsx';
import { Select } from '../../components/ui/select.jsx';

const empty = { cycle_id: '', title: '', organization_name: '', description: '', eligibility: '', application_deadline: '' };

export default function OpportunityManager() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(empty);
  const [statusForm, setStatusForm] = useState({ application_id: '', status: 'under_review', reason: '' });

  const { data: opportunities, isLoading, error } = useQuery({
    queryKey: ['opportunities'],
    queryFn: () => api('/opportunities'),
  });

  const createMutation = useMutation({
    mutationFn: (body) => api('/opportunities', { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      setForm(empty);
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ application_id, status, reason }) =>
      api(`/opportunities/applications/${application_id}/status`, { method: 'PATCH', body: { status, reason: reason || undefined } }),
    onSuccess: () => setStatusForm({ application_id: '', status: 'under_review', reason: '' }),
  });

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <h2 className="font-medium mb-3">Post New Opportunity</h2>
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate(form);
          }}
        >
          <div>
            <Label>Cycle ID</Label>
            <Input value={form.cycle_id} onChange={(e) => setForm({ ...form, cycle_id: e.target.value })} required />
          </div>
          <div>
            <Label>Title</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </div>
          <div>
            <Label>Organization</Label>
            <Input value={form.organization_name} onChange={(e) => setForm({ ...form, organization_name: e.target.value })} required />
          </div>
          <div>
            <Label>Application Deadline</Label>
            <Input type="date" value={form.application_deadline} onChange={(e) => setForm({ ...form, application_deadline: e.target.value })} />
          </div>
          <div className="col-span-2">
            <Label>Description</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="col-span-2">
            <Label>Eligibility</Label>
            <Input value={form.eligibility} onChange={(e) => setForm({ ...form, eligibility: e.target.value })} />
          </div>
          <Button type="submit" disabled={createMutation.isPending} className="col-span-2">Post Opportunity</Button>
          {createMutation.error && <p className="text-sm text-red-600 col-span-2">{createMutation.error.message}</p>}
        </form>
      </Card>

      <Card className="p-4">
        <h2 className="font-medium mb-3">Update Application Status</h2>
        {/* ponytail: no list-applications-by-opportunity endpoint exists yet — enter the application id manually. */}
        <form
          className="grid grid-cols-3 gap-3 items-end"
          onSubmit={(e) => {
            e.preventDefault();
            statusMutation.mutate(statusForm);
          }}
        >
          <div>
            <Label>Application ID</Label>
            <Input value={statusForm.application_id} onChange={(e) => setStatusForm({ ...statusForm, application_id: e.target.value })} required />
          </div>
          <div>
            <Label>Status</Label>
            <Select value={statusForm.status} onChange={(e) => setStatusForm({ ...statusForm, status: e.target.value })}>
              <option value="under_review">under_review</option>
              <option value="offered">offered</option>
              <option value="crcs_approved">crcs_approved</option>
              <option value="rejected">rejected</option>
            </Select>
          </div>
          <div>
            <Label>Reason (if rejecting)</Label>
            <Input value={statusForm.reason} onChange={(e) => setStatusForm({ ...statusForm, reason: e.target.value })} />
          </div>
          <Button type="submit" disabled={statusMutation.isPending} className="col-span-3">Update Status</Button>
          {statusMutation.error && <p className="text-sm text-red-600 col-span-3">{statusMutation.error.message}</p>}
        </form>
      </Card>

      <Card className="p-4">
        <h2 className="font-medium mb-3">Posted Opportunities</h2>
        {isLoading && <p>Loading…</p>}
        {error && <p className="text-red-600 text-sm">{error.message}</p>}
        <ul className="divide-y divide-slate-200">
          {opportunities?.map((o) => (
            <li key={o.id} className="py-2 text-sm">
              <span className="font-medium">{o.title}</span> — {o.organization_name}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
