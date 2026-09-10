import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Card } from '../../components/ui/card.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Select } from '../../components/ui/select.jsx';
import { Label } from '../../components/ui/label.jsx';
import { PageHeader, EmptyState } from '../../components/ui/page.jsx';
import { documentPreviewUrl } from '../../lib/documentPreview.js';

const trackForEntityType = { research_application: 'research', opportunity_application: 'crcs_opportunity', self_internship: 'self_internship' };

function PreviewModal({ item, onClose }) {
  const previewUrl = documentPreviewUrl(item);
  if (!item || !previewUrl) return null;
  return <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><Card role="dialog" aria-modal="true" aria-label={`Preview ${item.title ?? item.file_name}`} className="flex max-h-[calc(100vh-2rem)] w-full max-w-6xl flex-col overflow-hidden bg-white p-0 shadow-2xl"><div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Document preview</p><h2 className="truncate text-lg font-bold text-slate-950">{item.title ?? item.file_name}</h2><p className="mt-1 text-xs text-slate-500">Previewing inside the portal.</p></div><Button variant="ghost" className="shrink-0 px-3" onClick={onClose}>Close</Button></div><iframe title={`Preview: ${item.title ?? item.file_name}`} src={previewUrl} className="min-h-[60vh] w-full flex-1 bg-slate-100" /></Card></div>;
}

export default function DocumentsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [file, setFile] = useState(null);
  const [selectedRecordKey, setSelectedRecordKey] = useState('');
  const [reportDeadlineId, setReportDeadlineId] = useState('');
  const [weekNumber, setWeekNumber] = useState('');
  const [reportTemplateId, setReportTemplateId] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [previewItem, setPreviewItem] = useState(null);
  const { data: docs, isLoading } = useQuery({ queryKey: ['documents', user.id], queryFn: () => api(`/documents?student_id=${user.id}`) });
  const { data: research } = useQuery({ queryKey: ['my-research-context', user.id], queryFn: () => api(`/research/dashboard/${user.id}`), retry: false });
  const { data: selfInternships = [] } = useQuery({ queryKey: ['my-self-internships'], queryFn: () => api('/self-internships') });
  const { data: opportunityApplications = [] } = useQuery({ queryKey: ['my-opportunity-applications'], queryFn: () => api('/opportunities/my-applications') });
  const { data: reportDeadlines = [], error: deadlinesError } = useQuery({ queryKey: ['my-report-deadlines'], queryFn: () => api('/report-deadlines/my'), retry: false });
  const { data: programmeDocuments = [] } = useQuery({ queryKey: ['programme-documents'], queryFn: () => api('/programme-documents') });
  const { data: requirements = [] } = useQuery({ queryKey: ['report-requirements', 'student'], queryFn: () => api('/report-requirements') });
  const standards = programmeDocuments.filter((item) => item.audience !== 'faculty');
  const approvedRecords = [
    ...(research?.application?.status === 'crcs_approved' ? [{ key: `research_application:${research.application.id}`, type: 'research_application', id: research.application.id, label: `Research internship — ${research.application.title ?? 'Approved research project'}`, detail: research.mentorAssignment?.faculty_name ? `Mentor: ${research.mentorAssignment.faculty_name}` : 'Approved by CRCS' }] : []),
    ...opportunityApplications.filter((item) => item.status === 'crcs_approved' && item.assigned_mentor_id).map((item) => ({ key: `opportunity_application:${item.id}`, type: 'opportunity_application', id: item.id, label: `CRCS opportunity — ${item.opportunity?.title ?? 'Approved opportunity'}`, detail: `Mentor: ${item.mentor?.full_name ?? 'Allocated faculty mentor'}` })),
    ...selfInternships.filter((item) => item.status === 'active' && item.assigned_mentor_id).map((item) => ({ key: `self_internship:${item.id}`, type: 'self_internship', id: item.id, label: `Self-internship — ${item.company_name}`, detail: `Mentor: ${item.mentor?.full_name ?? 'Allocated faculty mentor'}` })),
  ];
  const selectedRecord = approvedRecords.find((record) => record.key === selectedRecordKey) ?? (approvedRecords.length === 1 ? approvedRecords[0] : null);
  const waitingForMentor = [...opportunityApplications.filter((item) => item.status === 'crcs_approved' && !item.assigned_mentor_id).map((item) => `CRCS opportunity — ${item.opportunity?.title ?? 'Approved opportunity'}`), ...selfInternships.filter((item) => item.status === 'active' && !item.assigned_mentor_id).map((item) => `Self-internship — ${item.company_name}`)];
  const relevantDeadlines = selectedRecord ? reportDeadlines.filter((deadline) => deadline.related_entity_type === selectedRecord.type && deadline.related_entity_id === selectedRecord.id) : [];
  const selectedDeadline = relevantDeadlines.find((deadline) => deadline.id === reportDeadlineId) ?? null;
  const selectedRequirement = selectedDeadline?.report_template_id ? requirements.find((item) => item.report_template_id === selectedDeadline.report_template_id) : null;
  const selectedEntityType = selectedRecord?.type;
  const { data: templates = [] } = useQuery({ queryKey: ['report-templates', selectedEntityType], queryFn: () => api(`/report-templates?track=${trackForEntityType[selectedEntityType]}`), enabled: !!selectedEntityType });

  async function onSubmit(event) {
    event.preventDefault();
    if (!file) return setError('Choose a file first.');
    if (!selectedRecord) return setError('Select your approved internship record first.');
    if (!selectedDeadline) return setError('Select the report deadline set by your mentor.');
    setError(null); setBusy(true);
    try { const fd = new FormData(); fd.append('file', file); fd.append('related_entity_type', selectedRecord.type); fd.append('related_entity_id', selectedRecord.id); fd.append('report_deadline_id', selectedDeadline.id); if (weekNumber) fd.append('week_number', weekNumber); if (reportTemplateId) fd.append('report_template_id', reportTemplateId); await api('/documents/upload', { method: 'POST', body: fd, isFormData: true }); qc.invalidateQueries({ queryKey: ['documents', user.id] }); setFile(null); setWeekNumber(''); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return <div className="max-w-7xl space-y-6"><PageHeader eyebrow="Documents" title="Upload and track your reports" description="Guidelines stay beside your upload workspace so you can review a format and submit a report without leaving the page." />
    {waitingForMentor.length > 0 && <div className="inline-notice border-amber-200 bg-amber-50 text-amber-900"><p className="font-semibold">Waiting for faculty mentor allocation</p><p className="mt-1">{waitingForMentor.join(', ')} {waitingForMentor.length === 1 ? 'is' : 'are'} approved. CRCS will allocate a faculty mentor before document uploads open.</p></div>}
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(360px,0.9fr)_minmax(460px,1.1fr)]"><div className="space-y-6"><Card className="p-6"><h2 className="font-bold">Guidelines, formats and samples</h2><p className="form-help mb-4">Open any standard in a preview window without leaving the portal.</p>{standards.length ? <div className="space-y-3">{standards.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"><div className="min-w-0"><p className="truncate font-semibold text-slate-900">{item.title}</p><p className="mt-1 text-xs capitalize text-slate-500">{item.category}</p></div>{item.url && <Button variant="secondary" className="shrink-0 px-3 py-1.5 text-xs" onClick={() => setPreviewItem(item)}>Preview</Button>}</div>)}</div> : <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">CRCS has not published programme documents yet.</p>}</Card>
        {reportDeadlines.length > 0 && <Card className="p-6"><h2 className="font-bold">Report deadline reminders</h2><p className="form-help mb-4">Your mentor-set deadlines appear here.</p><div className="space-y-3">{reportDeadlines.map((deadline) => { const overdue = new Date(deadline.due_at) < new Date(); return <div key={deadline.id} className="flex flex-col justify-between gap-2 rounded-lg border border-slate-200 p-4 sm:flex-row sm:items-center"><div><p className="font-semibold text-slate-900">{deadline.title}</p><p className="text-sm text-slate-600">Due {new Date(deadline.due_at).toLocaleString()}</p></div><Badge status={overdue ? 'rejected' : 'pending'}>{overdue ? 'overdue' : 'upcoming'}</Badge></div>; })}</div></Card>}</div>
      <div className="space-y-6"><Card className="p-6"><h2 className="font-bold">Upload a document</h2><p className="form-help mb-5">PDF, Word, and presentation files work best. Attach documents to an approved internship report deadline.</p>{!approvedRecords.length ? <div className="inline-notice border-amber-200 bg-amber-50 text-amber-900">This upload area is locked until CRCS approves an internship application and allocates a faculty mentor. You can still preview guidelines and view your submitted documents below.</div> : <form onSubmit={onSubmit} className="space-y-4"><div><Label>Approved internship record</Label><Select value={selectedRecordKey || (approvedRecords.length === 1 ? approvedRecords[0].key : '')} onChange={(event) => { setSelectedRecordKey(event.target.value); setReportDeadlineId(''); setReportTemplateId(''); }} required>{approvedRecords.length > 1 && <option value="">Select your approved internship</option>}{approvedRecords.map((record) => <option key={record.key} value={record.key}>{record.label}</option>)}</Select>{selectedRecord && <p className="form-help mt-2">{selectedRecord.detail}</p>}</div>{selectedRecord && <div><Label>Faculty report deadline</Label><Select value={reportDeadlineId} onChange={(event) => { const deadline = relevantDeadlines.find((item) => item.id === event.target.value); setReportDeadlineId(event.target.value); setReportTemplateId(deadline?.report_template_id ?? ''); }} required><option value="">Select the report deadline</option>{relevantDeadlines.filter((deadline) => new Date(deadline.due_at) >= new Date()).map((deadline) => <option key={deadline.id} value={deadline.id}>{deadline.title} — due {new Date(deadline.due_at).toLocaleString()}</option>)}</Select>{!relevantDeadlines.length && <p className="mt-2 text-sm text-amber-700">Your mentor has not set a report deadline yet. Uploading is locked until one is set.</p>}{deadlinesError && <p className="mt-2 text-sm text-red-600">{deadlinesError.message}</p>}{selectedRequirement && <p className="mt-2 rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-900"><span className="font-semibold">Required report:</span> {selectedRequirement.title} · assessed out of {selectedRequirement.max_marks}{selectedRequirement.guidance_document?.url && <> · <button type="button" className="font-semibold underline" onClick={() => setPreviewItem(selectedRequirement.guidance_document)}>Preview guidance</button></>}</p>}</div>}<div><Label>File</Label><input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="mt-1 block w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-600" /></div><div><Label>Week number (weekly reports only)</Label><Input type="number" value={weekNumber} onChange={(event) => setWeekNumber(event.target.value)} /></div><div><Label>Report template (optional)</Label><Select value={reportTemplateId} onChange={(event) => setReportTemplateId(event.target.value)} disabled={Boolean(selectedDeadline?.report_template_id)}><option value="">General document</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</Select></div>{error && <p className="text-sm text-red-600">{error}</p>}<Button type="submit" disabled={busy || !selectedRecord}>{busy ? 'Uploading…' : 'Upload document'}</Button></form>}</Card>
        <Card className="p-6"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold">My documents</h2><p className="form-help">Preview your uploaded reports and read mentor feedback here.</p></div><Badge status="approved">{docs?.length ?? 0} files</Badge></div>{isLoading && <p className="loading-state">Loading your documents…</p>}<ul className="space-y-2">{docs?.map((doc) => <li key={doc.id} className="flex items-center justify-between gap-4 border-b border-slate-100 py-3 text-sm last:border-0"><div className="min-w-0"><p className="truncate font-semibold text-slate-800">{doc.file_name}</p>{doc.review_comment && <p className="mt-1 truncate text-xs text-amber-800">Mentor feedback: {doc.review_comment}</p>}</div>{doc.url && <Button variant="secondary" className="shrink-0 px-3 py-1.5 text-xs" onClick={() => setPreviewItem({ ...doc, title: doc.file_name })}>Open</Button>}</li>)}{!isLoading && !docs?.length && <li><EmptyState title="No documents uploaded yet" description="Your submitted reports and supporting files will appear here." /></li>}</ul></Card></div></div>
    <PreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />
  </div>;
}
