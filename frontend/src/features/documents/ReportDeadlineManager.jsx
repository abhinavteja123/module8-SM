import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { readMentorAllocations } from '../../lib/mentorAllocationCache.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Card } from '../../components/ui/card.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Label } from '../../components/ui/label.jsx';
import { Select } from '../../components/ui/select.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { EmptyState, PageHeader } from '../../components/ui/page.jsx';
import { documentPreviewUrl } from '../../lib/documentPreview.js';
import { useCycle } from '../../cycles/CycleContext.jsx';

const labels = { research: 'Research internship', opportunity: 'CRCS opportunity', self_internship: 'Self-internship' };
function typeFor(mapping) { return mapping.type === 'research' ? 'research_application' : mapping.type === 'opportunity' ? 'opportunity_application' : 'self_internship'; }

export default function ReportDeadlineManager() {
  const { user } = useAuth();
  const { selectedCycle, selectedCycleId } = useCycle();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ mappingKey: '', title: '', due_at: '', report_template_id: '' });
  const { data: allocationData } = useQuery({ queryKey: ['report-deadline-mentor-allocations', user?.id, selectedCycleId], queryFn: () => api(`/mentor-allocations?cycle_id=${selectedCycleId}`), enabled: !!selectedCycleId, initialData: () => readMentorAllocations(user?.id), staleTime: 30_000 });
  const mappings = allocationData?.mappings ?? [];
  const { data: templates = [] } = useQuery({ queryKey: ['report-templates'], queryFn: () => api('/report-templates') });
  const { data: deadlines = [], error } = useQuery({ queryKey: ['assigned-report-deadlines', selectedCycleId], queryFn: () => api(`/report-deadlines/assigned?cycle_id=${selectedCycleId}`), enabled: !!selectedCycleId, retry: false });
  const { data: programmeDocuments = [] } = useQuery({ queryKey: ['programme-documents'], queryFn: () => api('/programme-documents') });
  const standards = programmeDocuments.filter((item) => item.audience !== 'students');
  const save = useMutation({
    mutationFn: () => {
      const mapping = mappings.find((item) => `${item.type}:${item.id}` === form.mappingKey);
      if (!mapping) throw new Error('Select one of your allocated students.');
      return api('/report-deadlines', { method: 'POST', body: { cycle_id: selectedCycleId, student_id: mapping.student_id, related_entity_type: typeFor(mapping), related_entity_id: mapping.id, title: form.title, due_at: new Date(form.due_at).toISOString(), report_template_id: form.report_template_id || undefined } });
    },
    onSuccess: () => { setForm({ mappingKey: '', title: '', due_at: '', report_template_id: '' }); queryClient.invalidateQueries({ queryKey: ['assigned-report-deadlines'] }); },
  });
  const setField = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  if (!selectedCycleId) return <div className="max-w-3xl"><PageHeader eyebrow="Student supervision" title="No open cycle yet" description="Report deadlines can be set after CRCS publishes a cycle and students are allocated to you." /></div>;
  return <div className="max-w-6xl space-y-6"><PageHeader eyebrow={`Student supervision · ${selectedCycle?.name ?? 'Selected cycle'}`} title="Set report deadlines" description="Choose an allocated student, set their submission deadline, and the portal notifies them immediately plus 48 hours before it is due." />
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(320px,0.8fr)_minmax(420px,1.2fr)]">
      <Card className="p-6"><h2 className="font-bold">Guidelines, formats and samples</h2><p className="form-help mb-4">Open any standard in a new tab.</p>{standards.length ? <div className="space-y-3">{standards.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"><div className="min-w-0"><p className="truncate font-semibold text-slate-900">{item.title}</p><p className="mt-1 text-xs capitalize text-slate-500">{item.category}</p></div>{item.url && <a href={documentPreviewUrl(item)} target="_blank" rel="noreferrer"><Button variant="secondary" className="shrink-0 px-3 py-1.5 text-xs">Preview</Button></a>}</div>)}</div> : <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">CRCS has not published programme documents yet.</p>}</Card>
      <div className="space-y-6">
        <Card className="p-6"><h2 className="font-bold">Create a report deadline</h2><p className="mt-1 text-sm text-slate-600">Students can upload a report only against a deadline you set for their internship.</p><form className="mt-5 grid gap-4" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}><div><Label>Allocated student and internship</Label><Select value={form.mappingKey} onChange={setField('mappingKey')} required><option value="">Select an allocated student</option>{mappings.map((mapping) => <option key={`${mapping.type}:${mapping.id}`} value={`${mapping.type}:${mapping.id}`}>{mapping.student?.full_name ?? 'Student'} — {labels[mapping.type] ?? 'Internship'}: {mapping.title}</option>)}</Select></div><div><Label>Report title</Label><Input value={form.title} onChange={setField('title')} placeholder="Weekly report — week 1" required /></div><div><Label>Due date and time</Label><Input type="datetime-local" value={form.due_at} onChange={setField('due_at')} required /></div><div><Label>Report template <span className="font-normal text-slate-400">(optional)</span></Label><Select value={form.report_template_id} onChange={setField('report_template_id')}><option value="">General report</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</Select></div>{save.isError && <p className="text-sm text-red-600">{save.error.message}</p>}<Button type="submit" disabled={save.isPending || !mappings.length}>{save.isPending ? 'Assigning…' : 'Set deadline and notify student'}</Button></form></Card>
        <Card className="p-6"><h2 className="font-bold">Your report deadlines</h2>{error && <p className="mt-3 text-sm text-red-600">{error.message}</p>}{!error && !deadlines.length && <div className="mt-4"><EmptyState title="No report deadlines yet" description="Choose an allocated student above to set their first report deadline." /></div>}<div className="mt-4 space-y-3">{deadlines.map((deadline) => <div key={deadline.id} className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3 last:border-0"><div><p className="font-semibold text-slate-900">{deadline.title}</p><p className="text-sm text-slate-600">{deadline.student?.full_name ?? 'Student'} · due {new Date(deadline.due_at).toLocaleString()}</p></div><Badge status="pending">scheduled</Badge></div>)}</div></Card>
      </div>
    </div>
  </div>;
}
