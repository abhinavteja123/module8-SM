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
import { documentPreviewUrl } from '../../lib/documentPreview.js';

const TRACKS = [['', 'All internship paths'], ['research', 'Research internship'], ['crcs_opportunity', 'CRCS opportunity'], ['self_internship', 'Self-internship']];
const CATEGORIES = [['guideline', 'Guideline'], ['format', 'Format'], ['sample', 'Sample'], ['rubric', 'Rubric']];
const emptyRequirement = { name: '', track: '', max_marks: '', description: '', guidance_document_id: '' };
const emptyResource = { title: '', category: 'guideline', audience: 'all', file: null };

function PublishedDocuments({ resources, onEdit }) {
  return <Card className="p-6"><div className="flex justify-between gap-3"><div><h2 className="font-bold">Published programme documents</h2><p className="form-help">Open a browser preview, or edit its title, type and visibility.</p></div><Badge status="approved">{resources.length} files</Badge></div>{!resources.length ? <div className="mt-5"><EmptyState title="Nothing published yet" description="Upload the supplied guidelines, formats, samples and rubric here." /></div> : <ul className="mt-5 space-y-3">{resources.map((item) => <li key={item.id} className="rounded-xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-900">{item.title}</p><p className="mt-1 text-sm capitalize text-slate-600">{item.category} · {item.audience}</p></div><div className="flex shrink-0 gap-3">{item.url && <a className="text-sm font-semibold text-indigo-700 underline" href={documentPreviewUrl(item)} target="_blank" rel="noreferrer">Preview</a>}<button type="button" className="text-sm font-semibold text-indigo-700 underline" onClick={() => onEdit(item)}>Edit</button></div></div></li>)}</ul>}</Card>;
}

function RequiredReports({ requirements, isLoading, trackLabel, onEdit }) {
  return <Card className="p-6"><div className="flex justify-between gap-3"><div><h2 className="font-bold">Required reports and marks</h2><p className="form-help">These determine the report choices and faculty score fields.</p></div><Badge status="approved">{requirements.length} set</Badge></div>{isLoading ? <p className="mt-5 text-sm text-slate-500">Loading requirements…</p> : !requirements.length ? <div className="mt-5"><EmptyState title="No report requirements yet" description="Publish the programme documents, then set the reports students must submit." /></div> : <ul className="mt-5 space-y-3">{requirements.map((item) => <li key={item.id} className="rounded-xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-900">{item.title}</p><p className="mt-1 text-sm text-slate-600">{trackLabel(item.track)}{item.guidance_document ? ` · ${item.guidance_document.title}` : ''}</p></div><div className="flex shrink-0 items-center gap-3"><Badge status="pending">{Number(item.max_marks) > 0 ? `/${item.max_marks}` : 'Required · ungraded'}</Badge><button type="button" className="text-sm font-semibold text-indigo-700 underline" onClick={() => onEdit(item)}>Edit</button></div></div>{item.description && <p className="mt-2 text-sm text-slate-600">{item.description}</p>}</li>)}</ul>}</Card>;
}

export default function ReportTemplateManager() {
  const queryClient = useQueryClient();
  const [requirement, setRequirement] = useState(emptyRequirement);
  const [resource, setResource] = useState(emptyResource);
  const [editingRequirementId, setEditingRequirementId] = useState(null);
  const [editingResourceId, setEditingResourceId] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [message, setMessage] = useState(null);
  const { data: requirements = [], isLoading } = useQuery({ queryKey: ['report-requirements'], queryFn: () => api('/report-requirements') });
  const { data: resources = [], error: resourcesError } = useQuery({ queryKey: ['programme-documents'], queryFn: () => api('/programme-documents') });
  const refreshResources = () => queryClient.invalidateQueries({ queryKey: ['programme-documents'] });
  const refreshRequirements = () => { queryClient.invalidateQueries({ queryKey: ['report-requirements'] }); queryClient.invalidateQueries({ queryKey: ['report-templates'] }); };
  const resetResource = () => { setResource(emptyResource); setEditingResourceId(null); setFileInputKey((value) => value + 1); };
  const resetRequirement = () => { setRequirement(emptyRequirement); setEditingRequirementId(null); };
  const saveResource = useMutation({
    mutationFn: async () => { if (!editingResourceId && !resource.file) throw new Error('Choose the document to publish.'); const body = new FormData(); body.append('title', resource.title); body.append('category', resource.category); body.append('audience', resource.audience); if (resource.file) body.append('file', resource.file); return api(editingResourceId ? `/programme-documents/${editingResourceId}` : '/programme-documents', { method: editingResourceId ? 'PATCH' : 'POST', body, isFormData: true }); },
    onSuccess: () => { refreshResources(); setMessage(editingResourceId ? 'Published document updated.' : 'Reference document published.'); resetResource(); },
    onError: (error) => setMessage(error.message),
  });
  const saveRequirement = useMutation({
    mutationFn: () => api(editingRequirementId ? `/report-requirements/${editingRequirementId}` : '/report-requirements', { method: editingRequirementId ? 'PATCH' : 'POST', body: { ...requirement, track: requirement.track || (editingRequirementId ? null : undefined), guidance_document_id: requirement.guidance_document_id || (editingRequirementId ? null : undefined), max_marks: Number(requirement.max_marks) } }),
    onSuccess: () => { refreshRequirements(); setMessage(editingRequirementId ? 'Required report updated.' : 'Required report and its marks field are ready.'); resetRequirement(); },
    onError: (error) => setMessage(error.message),
  });
  const trackLabel = (value) => TRACKS.find(([key]) => key === value)?.[1] ?? 'All internship paths';
  const editResource = (item) => { setMessage(null); setEditingResourceId(item.id); setResource({ title: item.title, category: item.category, audience: item.audience, file: null }); setFileInputKey((value) => value + 1); };
  const editRequirement = (item) => { setMessage(null); setEditingRequirementId(item.id); setRequirement({ name: item.title, track: item.track ?? '', max_marks: String(item.max_marks), description: item.description ?? '', guidance_document_id: item.guidance_document_id ?? '' }); };
  const errorState = saveResource.isError || saveRequirement.isError;

  return <div className="max-w-6xl space-y-6"><PageHeader eyebrow="Reports and documents" title="Programme-wide report requirements and guidance" description="These standards apply to every internship cycle. Manage documents on the left and report requirements on the right." />
    {resourcesError && <div className="inline-notice border-red-200 bg-red-50 text-red-800"><p className="font-semibold">Programme documents are not ready in Supabase yet</p><p className="mt-1">Apply migration 20260909000021_programme_documents_and_dynamic_marks.sql, then refresh this page and import the supplied files.</p></div>}
    {message && <p className={`text-sm ${errorState ? 'text-red-600' : 'text-emerald-700'}`}>{message}</p>}
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <section className="space-y-6"><Card className="p-6"><div className="flex items-start justify-between gap-3"><div><h2 className="font-bold">{editingResourceId ? 'Edit published document' : 'Publish guidance or a sample'}</h2><p className="form-help mb-3">Students and faculty can open these next to report uploads and reviews.</p></div>{editingResourceId && <Button type="button" variant="ghost" className="px-2" onClick={resetResource}>Cancel edit</Button>}</div><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); setMessage(null); saveResource.mutate(); }}><div><Label>Document title</Label><Input value={resource.title} onChange={(event) => setResource((value) => ({ ...value, title: event.target.value }))} placeholder="For example, Final assessment rubric" required /></div><div className="grid grid-cols-2 gap-3"><div><Label>Type</Label><Select value={resource.category} onChange={(event) => setResource((value) => ({ ...value, category: event.target.value }))}>{CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></div><div><Label>Show to</Label><Select value={resource.audience} onChange={(event) => setResource((value) => ({ ...value, audience: event.target.value }))}><option value="all">Everyone</option><option value="students">Students</option><option value="faculty">Faculty</option></Select></div></div><div><Label>{editingResourceId ? 'Replace file (optional)' : 'File'}</Label><input key={fileInputKey} type="file" accept=".pdf,.doc,.docx,.ppt,.pptx" onChange={(event) => setResource((value) => ({ ...value, file: event.target.files?.[0] ?? null }))} className="mt-1 block w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-sm" required={!editingResourceId} /></div><Button type="submit" disabled={saveResource.isPending}>{saveResource.isPending ? 'Saving…' : editingResourceId ? 'Save document changes' : 'Publish document'}</Button></form></Card><PublishedDocuments resources={resources} onEdit={editResource} /></section>
      <section className="space-y-6"><Card className="p-6"><div className="flex items-start justify-between gap-3"><div><h2 className="font-bold">{editingRequirementId ? 'Edit required report' : 'Make a report required'}</h2><p className="form-help mb-5">Set the maximum marks once. Faculty will see exactly these fields—no fixed Weekly/Mid/PPT columns.</p></div>{editingRequirementId && <Button type="button" variant="ghost" className="px-2" onClick={resetRequirement}>Cancel edit</Button>}</div><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); setMessage(null); saveRequirement.mutate(); }}><div><Label>Report name</Label><Input value={requirement.name} onChange={(event) => setRequirement((value) => ({ ...value, name: event.target.value }))} placeholder="For example, Mid-semester presentation" required /></div><div className="grid grid-cols-2 gap-3"><div><Label>Internship path</Label><Select value={requirement.track} onChange={(event) => setRequirement((value) => ({ ...value, track: event.target.value }))}>{TRACKS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></div><div><Label>Maximum marks</Label><Input type="number" min="0" step="0.5" value={requirement.max_marks} onChange={(event) => setRequirement((value) => ({ ...value, max_marks: event.target.value }))} required /></div></div><div><Label>Linked guidance <span className="font-normal text-slate-400">(optional)</span></Label><Select value={requirement.guidance_document_id} onChange={(event) => setRequirement((value) => ({ ...value, guidance_document_id: event.target.value }))}><option value="">No linked document</option>{resources.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</Select></div><div><Label>Instructions <span className="font-normal text-slate-400">(optional)</span></Label><textarea value={requirement.description} onChange={(event) => setRequirement((value) => ({ ...value, description: event.target.value }))} className="mt-1 min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="What must be submitted?" /></div><Button type="submit" disabled={saveRequirement.isPending}>{saveRequirement.isPending ? 'Saving…' : editingRequirementId ? 'Save report changes' : 'Add required report'}</Button></form></Card><RequiredReports requirements={requirements} isLoading={isLoading} trackLabel={trackLabel} onEdit={editRequirement} /></section>
    </div>
  </div>;
}
