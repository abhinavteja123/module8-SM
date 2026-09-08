import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Button } from '../../components/ui/button.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Card } from '../../components/ui/card.jsx';
import { Select } from '../../components/ui/select.jsx';
import { Label } from '../../components/ui/label.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { PageHeader, EmptyState } from '../../components/ui/page.jsx';

const TRACKS = [
  ['', 'All internship paths'],
  ['research', 'Research internship'],
  ['crcs_opportunity', 'CRCS opportunity'],
  ['self_internship', 'Self-internship'],
];

export default function ReportTemplateManager() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [track, setTrack] = useState('');
  const [message, setMessage] = useState(null);
  const { data: templates = [], isLoading } = useQuery({ queryKey: ['report-templates'], queryFn: () => api('/report-templates') });
  const create = useMutation({ mutationFn: () => api('/report-templates', { method: 'POST', body: { name, track: track || undefined } }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['report-templates'] }); setMessage(`“${name}” is ready for students to use.`); setName(''); setTrack(''); }, onError: (error) => setMessage(error.message) });
  const trackLabel = (value) => TRACKS.find(([key]) => key === value)?.[1] ?? 'All internship paths';
  return <div className="max-w-4xl"><PageHeader eyebrow="Reports and documents" title="Choose the reports students must submit" description="Templates give students a clear report type when they upload a document. The standard weekly, synopsis, and final reports are already available." />
    <div className="grid gap-6 lg:grid-cols-[0.9fr,1.1fr]"><Card className="p-6"><h2 className="font-bold">Add another report type</h2><p className="form-help mb-5">Use simple names students will recognise, such as “Industry mentor feedback” or “Completion certificate”.</p><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); setMessage(null); create.mutate(); }}><div><Label>Report name</Label><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="For example, Mid-term presentation" required /></div><div><Label>Who should use it?</Label><Select value={track} onChange={(event) => setTrack(event.target.value)}>{TRACKS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></div>{message && <p className={`text-sm ${create.isError ? 'text-red-600' : 'text-emerald-700'}`}>{message}</p>}<Button type="submit" disabled={create.isPending}>{create.isPending ? 'Adding…' : 'Add report type'}</Button></form></Card>
      <Card className="p-6"><div className="flex items-start justify-between gap-4"><div><h2 className="font-bold">Available report types</h2><p className="form-help">These are shown to students when they upload documents.</p></div><Badge status="approved">{templates.length} available</Badge></div>{isLoading ? <p className="mt-5 text-sm text-slate-500">Loading report types…</p> : !templates.length ? <div className="mt-5"><EmptyState title="No report types yet" description="Add a report type to guide student submissions." /></div> : <ul className="mt-5 space-y-3">{templates.map((template) => <li key={template.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-4"><div><p className="font-semibold text-slate-900">{template.name}</p><p className="mt-1 text-sm text-slate-600">{trackLabel(template.track)}</p></div>{template.is_default && <Badge status="approved">Standard</Badge>}</li>)}</ul>}</Card></div>
  </div>;
}
