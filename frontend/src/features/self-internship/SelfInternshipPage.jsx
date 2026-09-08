import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Card } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Label } from '../../components/ui/label.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Select } from '../../components/ui/select.jsx';
import { PageHeader } from '../../components/ui/page.jsx';

const supportingDocumentLabels = { offer_letter: 'Offer letter' };

export default function SelfInternshipPage() {
  const queryClient = useQueryClient();
  const [application, setApplication] = useState({ company_name: '', company_website: '', company_address: '', offer_source: '' });
  const [supportingFiles, setSupportingFiles] = useState({ offer_letter: null });
  const [activeId, setActiveId] = useState(null);

  const { data: cycle } = useQuery({ queryKey: ['cycle-current'], queryFn: () => api('/cycles/current'), retry: false });
  const { data: internships = [] } = useQuery({ queryKey: ['my-self-internships'], queryFn: () => api('/self-internships') });
  const { data: internshipStatus } = useQuery({ queryKey: ['my-internship-status'], queryFn: () => api('/students/me/internship-status'), retry: false });
  const { data: internship, error: lookupError } = useQuery({ queryKey: ['self-internship', activeId], queryFn: () => api(`/self-internships/${activeId}`), enabled: !!activeId });
  const { data: supportingDocuments = [] } = useQuery({ queryKey: ['self-internship-documents', activeId], queryFn: () => api(`/documents?related_entity_id=${activeId}`), enabled: !!activeId });
  const { data: reportDeadlines = [] } = useQuery({ queryKey: ['my-report-deadlines'], queryFn: () => api('/report-deadlines/my'), retry: false });

  const internshipApproved = Boolean(internshipStatus?.approved);
  const editableRequest = internships.find((item) => ['submitted', 'rejected'].includes(item.status));
  useEffect(() => {
    if (!activeId && internships.length) setActiveId(editableRequest?.id ?? internships[0].id);
  }, [activeId, editableRequest?.id, internships]);

  async function uploadSupportingDocuments(internshipId, files) {
    for (const [type, file] of Object.entries(files)) {
      if (!file) throw new Error(`${supportingDocumentLabels[type]} is required.`);
      const body = new FormData();
      body.append('file', file);
      body.append('related_entity_type', 'self_internship');
      body.append('related_entity_id', internshipId);
      body.append('upload_purpose', 'self_internship_supporting');
      body.append('supporting_document_type', type);
      await api('/documents/upload', { method: 'POST', body, isFormData: true });
    }
  }

  const refreshRequest = (id) => {
    queryClient.invalidateQueries({ queryKey: ['my-self-internships'] });
    queryClient.invalidateQueries({ queryKey: ['self-internship', id] });
    queryClient.invalidateQueries({ queryKey: ['self-internship-documents', id] });
  };
  const createMutation = useMutation({
    mutationFn: async () => {
      const record = await api('/self-internships', { method: 'POST', body: { cycle_id: cycle.id, ...application } });
      try {
        await uploadSupportingDocuments(record.id, supportingFiles);
      } catch (error) {
        error.internshipId = record.id;
        throw error;
      }
      return record;
    },
    onSuccess: (record) => { setActiveId(record.id); setApplication({ company_name: '', company_website: '', company_address: '', offer_source: '' }); setSupportingFiles({ offer_letter: null }); refreshRequest(record.id); },
    onError: (error) => {
      if (error.internshipId) {
        setActiveId(error.internshipId);
        refreshRequest(error.internshipId);
      }
    },
  });
  const reuploadMutation = useMutation({
    mutationFn: () => uploadSupportingDocuments(activeId, supportingFiles),
    onSuccess: () => { setSupportingFiles({ offer_letter: null }); refreshRequest(activeId); },
  });

  const activeDeadlines = reportDeadlines.filter((deadline) => deadline.related_entity_type === 'self_internship' && deadline.related_entity_id === activeId);
  const documentFor = (documentId) => supportingDocuments.find((document) => document.id === documentId);
  const setFile = (type) => (event) => setSupportingFiles((current) => ({ ...current, [type]: event.target.files?.[0] ?? null }));
  const canCreate = !internshipApproved && !editableRequest;
  const canReupload = internship && ['submitted', 'rejected'].includes(internship.status) && !internshipApproved;

  return <div className="max-w-4xl space-y-6">
    <PageHeader eyebrow="Independent internship" title="My self-internship" description="Give CRCS your company and offer details, then upload the offer letter for review." />
    <div className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
      <Card className="p-6">
        <h2 className="font-bold">1. Submit company and offer details</h2>
        <p className="form-help mb-5">All details and the offer letter are required before CRCS can approve your self-internship.</p>
        {internshipApproved ? <div className="inline-notice border-emerald-200 bg-emerald-50 text-emerald-900">Your internship has been approved, so this request is locked.</div> : !canCreate ? <div className="inline-notice border-amber-200 bg-amber-50 text-amber-900">You already have a request with CRCS. Use the request panel to review its status or upload corrected documents.</div> : <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); createMutation.mutate(); }}>
          <div><Label>Company name</Label><Input value={application.company_name} onChange={(event) => setApplication((current) => ({ ...current, company_name: event.target.value }))} required /></div>
          <div><Label>Company website</Label><Input type="url" value={application.company_website} onChange={(event) => setApplication((current) => ({ ...current, company_website: event.target.value }))} placeholder="https://company.example" required /></div>
          <div><Label>Company address</Label><textarea value={application.company_address} onChange={(event) => setApplication((current) => ({ ...current, company_address: event.target.value }))} className="mt-1 min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Full office address" required /></div>
          <div><Label>How did you receive this offer?</Label><textarea value={application.offer_source} onChange={(event) => setApplication((current) => ({ ...current, offer_source: event.target.value }))} className="mt-1 min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="For example: campus placement, referral, company career portal, or direct application" required /></div>
          {Object.entries(supportingDocumentLabels).map(([type, label]) => <div key={type}><Label>{label}</Label><Input type="file" accept=".pdf,.doc,.docx" onChange={setFile(type)} required /><p className="form-help mt-1">PDF, DOC, or DOCX.</p></div>)}
          {createMutation.error && <p className="text-sm text-red-600">{createMutation.error.message}</p>}
          <Button type="submit" disabled={createMutation.isPending || !cycle}>{createMutation.isPending ? 'Uploading and submitting…' : 'Upload documents and submit to CRCS'}</Button>
        </form>}
      </Card>

      <Card className="p-6">
        <h2 className="font-bold">2. Track CRCS review</h2><p className="form-help mb-4">CRCS can approve the complete request or return it with a reason for correction.</p>
        <Select value={activeId ?? ''} onChange={(event) => setActiveId(event.target.value || null)}><option value="">Select an internship</option>{internships.map((item) => <option key={item.id} value={item.id}>{item.company_name} — {item.status.replaceAll('_', ' ')}</option>)}</Select>
        {lookupError && <p className="mt-3 text-sm text-red-600">{lookupError.message}</p>}
        {internship && <div className="mt-4 space-y-4 text-sm">
          <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{internship.company_name}</p><p className="mt-1 text-slate-600">Supporting documents submitted with this request.</p></div><Badge status={internship.status} /></div>
          <div className="space-y-2 rounded-lg bg-slate-50 p-3"><p><span className="font-semibold">Website:</span> <a href={internship.company_website} target="_blank" rel="noreferrer" className="text-indigo-700 underline">{internship.company_website}</a></p><p><span className="font-semibold">Address:</span> {internship.company_address}</p><p><span className="font-semibold">Offer received through:</span> {internship.offer_source}</p>{Object.entries(supportingDocumentLabels).map(([type, label]) => { const document = documentFor(internship[`${type}_doc_id`]); return <div key={type} className="flex items-center justify-between gap-3"><span className="font-semibold">{label}</span>{document?.url ? <a href={document.url} target="_blank" rel="noreferrer" className="font-semibold text-indigo-700 underline">View uploaded file</a> : <span className="text-amber-700">Not uploaded</span>}</div>; })}</div>
          {internship.status === 'submitted' && <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-indigo-950">Your request and documents are with CRCS for review. You can replace either file until a decision is made.</div>}
          {internship.status === 'rejected' && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-900"><p className="font-semibold">CRCS requested corrections</p><p className="mt-1">{internship.rejection_reason}</p></div>}
          {canReupload && <form className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3" onSubmit={(event) => { event.preventDefault(); reuploadMutation.mutate(); }}><p className="font-semibold text-amber-950">Upload corrected supporting documents</p>{Object.entries(supportingDocumentLabels).map(([type, label]) => <div key={type}><Label>{label}</Label><Input type="file" accept=".pdf,.doc,.docx" onChange={setFile(type)} required /></div>)}{reuploadMutation.error && <p className="text-sm text-red-600">{reuploadMutation.error.message}</p>}<Button type="submit" disabled={reuploadMutation.isPending}>{reuploadMutation.isPending ? 'Uploading…' : 'Re-upload and return to CRCS'}</Button></form>}
          {internship.status === 'active' && !internship.assigned_mentor_id && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900"><p className="font-semibold">Approved and locked</p><p className="mt-1">CRCS approved your company details and offer letter. Your request is locked while CRCS assigns a faculty mentor.</p></div>}
          {internship.status === 'active' && internship.mentor && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-900"><p className="font-semibold">Faculty mentor allocated: {internship.mentor.full_name}</p><p className="mt-1">Your approved offer letter is above. Your mentor will set report deadlines; submit each report from Documents once a deadline appears.</p>{activeDeadlines.length > 0 ? <ul className="mt-3 space-y-1">{activeDeadlines.map((deadline) => <li key={deadline.id}>{deadline.title} — due {new Date(deadline.due_at).toLocaleString()}</li>)}</ul> : <p className="mt-2">No report deadline has been set yet.</p>}<Link to="/student/documents"><Button variant="secondary" className="mt-3">Open report submissions</Button></Link></div>}
        </div>}
      </Card>
    </div>
  </div>;
}
