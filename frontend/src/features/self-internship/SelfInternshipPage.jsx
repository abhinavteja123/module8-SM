import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Card } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Label } from '../../components/ui/label.jsx';
import { Badge } from '../../components/ui/badge.jsx';

export default function SelfInternshipPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ cycle_id: '', company_name: '', company_profile_doc_id: '', offer_letter_doc_id: '' });
  const [lookupId, setLookupId] = useState('');
  const [activeId, setActiveId] = useState(null);
  const [certificateDocId, setCertificateDocId] = useState('');

  const createMutation = useMutation({
    mutationFn: (body) => api('/self-internships', { method: 'POST', body }),
    onSuccess: (data) => setActiveId(data.id),
  });

  const { data: internship, refetch, error: lookupError } = useQuery({
    queryKey: ['self-internship', activeId],
    queryFn: () => api(`/self-internships/${activeId}`),
    enabled: !!activeId,
  });

  const certificateMutation = useMutation({
    mutationFn: (certificate_doc_id) => api(`/self-internships/${activeId}/certificate`, { method: 'PATCH', body: { certificate_doc_id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['self-internship', activeId] }),
  });

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <h2 className="font-medium mb-3">Start a Self-Internship</h2>
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
            <Label>Company Name</Label>
            <Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} required />
          </div>
          <div>
            <Label>Company Profile Doc ID</Label>
            <Input value={form.company_profile_doc_id} onChange={(e) => setForm({ ...form, company_profile_doc_id: e.target.value })} />
          </div>
          <div>
            <Label>Offer Letter Doc ID</Label>
            <Input value={form.offer_letter_doc_id} onChange={(e) => setForm({ ...form, offer_letter_doc_id: e.target.value })} />
          </div>
          <Button type="submit" disabled={createMutation.isPending} className="col-span-2">Submit</Button>
          {createMutation.error && <p className="text-sm text-red-600 col-span-2">{createMutation.error.message}</p>}
          {createMutation.data?.note && <p className="text-sm text-amber-600 col-span-2">{createMutation.data.note}</p>}
        </form>
      </Card>

      <Card className="p-4">
        <h2 className="font-medium mb-3">Look Up My Self-Internship</h2>
        {/* ponytail: no student-scoped list endpoint yet — look up by id (returned on submit above, or paste one you already have). */}
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Label>Self-Internship ID</Label>
            <Input value={lookupId} onChange={(e) => setLookupId(e.target.value)} />
          </div>
          <Button onClick={() => { setActiveId(lookupId); refetch(); }}>Look Up</Button>
        </div>
        {lookupError && <p className="text-sm text-red-600 mt-2">{lookupError.message}</p>}
        {internship && (
          <div className="mt-4 text-sm space-y-1">
            <p><span className="font-medium">{internship.company_name}</span> <Badge status={internship.status} /></p>
            {internship.rejection_reason && <p className="text-red-600">Rejected: {internship.rejection_reason}</p>}
            {internship.status === 'active' && (
              <div className="mt-3 flex gap-2 items-end">
                <div className="flex-1">
                  <Label>Completion Certificate Doc ID</Label>
                  <Input value={certificateDocId} onChange={(e) => setCertificateDocId(e.target.value)} />
                </div>
                <Button onClick={() => certificateMutation.mutate(certificateDocId)} disabled={certificateMutation.isPending}>
                  Submit Certificate
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
