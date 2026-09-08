import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Button } from '../../components/ui/button.jsx';
import { Card } from '../../components/ui/card.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Label } from '../../components/ui/label.jsx';
import { Select } from '../../components/ui/select.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { EmptyState, PageHeader } from '../../components/ui/page.jsx';

const labels = { research: 'Research internship', opportunity: 'CRCS opportunity', self_internship: 'Self-internship' };
function typeFor(mapping) { return mapping.type === 'research' ? 'research_application' : mapping.type === 'opportunity' ? 'opportunity_application' : 'self_internship'; }

export default function ReportDeadlineManager() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ mappingKey: '', title: '', due_at: '', report_template_id: '' });
  const { data: allocationData } = useQuery({ queryKey: ['mentor-allocations'], queryFn: () => api('/mentor-allocations') });
  const mappings = allocationData?.mappings ?? [];
  const { data: templates = [] } = useQuery({ queryKey: ['report-templates'], queryFn: () => api('/report-templates') });
  const { data: deadlines = [], error } = useQuery({ queryKey: ['assigned-report-deadlines'], queryFn: () => api('/report-deadlines/assigned'), retry: false });
  const save = useMutation({
    mutationFn: () => {
      const mapping = mappings.find((item) => `${item.type}:${item.id}` === form.mappingKey);
      if (!mapping) throw new Error('Select one of your allocated students.');
      return api('/report-deadlines', { method: 'POST', body: { student_id: mapping.student_id, related_entity_type: typeFor(mapping), related_entity_id: mapping.id, title: form.title, due_at: new Date(form.due_at).toISOString(), report_template_id: form.report_template_id || undefined } });
    },
    onSuccess: () => { setForm({ mappingKey: '', title: '', due_at: '', report_template_id: '' }); queryClient.invalidateQueries({ queryKey: ['assigned-report-deadlines'] }); },
  });
  const setField = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  return <div className="max-w-3xl space-y-6"><PageHeader eyebrow="Student supervision" title="Set report deadlines" description="Choose an allocated student, set their submission deadline, and the portal notifies them immediately plus 48 hours before it is due." />
    <Card className="p-6"><h2 className="font-bold">Create a report deadline</h2><p className="mt-1 text-sm text-slate-600">Students can upload a report only against a deadline you set for their internship.</p><form className="mt-5 grid gap-4" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}><div><Label>Allocated student and internship</Label><Select value={form.mappingKey} onChange={setField('mappingKey')} required><option value="">Select an allocated student</option>{mappings.map((mapping) => <option key={`${mapping.type}:${mapping.id}`} value={`${mapping.type}:${mapping.id}`}>{mapping.student?.full_name ?? 'Student'} — {labels[mapping.type] ?? 'Internship'}: {mapping.title}</option>)}</Select></div><div><Label>Report title</Label><Input value={form.title} onChange={setField('title')} placeholder="Weekly report — week 1" required /></div><div><Label>Due date and time</Label><Input type="datetime-local" value={form.due_at} onChange={setField('due_at')} required /></div><div><Label>Report template <span className="font-normal text-slate-400">(optional)</span></Label><Select value={form.report_template_id} onChange={setField('report_template_id')}><option value="">General report</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</Select></div>{save.isError && <p className="text-sm text-red-600">{save.error.message}</p>}<Button type="submit" disabled={save.isPending || !mappings.length}>{save.isPending ? 'Assigning…' : 'Set deadline and notify student'}</Button></form></Card>
    <Card className="p-6"><h2 className="font-bold">Your report deadlines</h2>{error && <p className="mt-3 text-sm text-red-600">{error.message}</p>}{!error && !deadlines.length && <div className="mt-4"><EmptyState title="No report deadlines yet" description="Choose an allocated student above to set their first report deadline." /></div>}<div className="mt-4 space-y-3">{deadlines.map((deadline) => <div key={deadline.id} className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3 last:border-0"><div><p className="font-semibold text-slate-900">{deadline.title}</p><p className="text-sm text-slate-600">{deadline.student?.full_name ?? 'Student'} · due {new Date(deadline.due_at).toLocaleString()}</p></div><Badge status="pending">scheduled</Badge></div>)}</div></Card>
  </div>;
}
