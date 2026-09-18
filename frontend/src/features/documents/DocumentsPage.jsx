import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Eye, UploadSimple, WarningCircle } from '@phosphor-icons/react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Card } from '../../components/ui/card.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Select } from '../../components/ui/select.jsx';
import { Label } from '../../components/ui/label.jsx';
import { PageHeader, EmptyState } from '../../components/ui/page.jsx';
import { Skeleton } from '../../components/ui/skeleton.jsx';
import { Dialog } from '../../components/ui/dialog.jsx';
import { documentPreviewUrl } from '../../lib/documentPreview.js';
import { useCycle } from '../../cycles/CycleContext.jsx';

const trackForEntityType = { research_application: 'research', opportunity_application: 'crcs_opportunity', self_internship: 'self_internship' };

function PreviewModal({ item, onClose }) {
  const previewUrl = documentPreviewUrl(item);
  const open = Boolean(item && previewUrl);
  // Keep the last item rendered while the dialog's exit transition plays, so the
  // panel doesn't flash empty for the ~200ms fade-out after `item` is cleared.
  const [lastItem, setLastItem] = useState(item);
  useEffect(() => { if (open) setLastItem(item); }, [open, item]);
  const shown = open ? item : lastItem;

  return (
    <Dialog open={open} onClose={onClose} title={shown ? (shown.title ?? shown.file_name) : undefined} size="xl">
      {shown && (
        <iframe
          title={`Preview: ${shown.title ?? shown.file_name}`}
          src={documentPreviewUrl(shown)}
          className="min-h-[60vh] w-full rounded-xl bg-slate-100"
        />
      )}
    </Dialog>
  );
}

export default function DocumentsPage() {
  const { user } = useAuth();
  const { selectedCycle, selectedCycleId } = useCycle();
  const qc = useQueryClient();
  const [file, setFile] = useState(null);
  const [selectedRecordKey, setSelectedRecordKey] = useState('');
  const [reportDeadlineId, setReportDeadlineId] = useState('');
  const [weekNumber, setWeekNumber] = useState('');
  const [reportTemplateId, setReportTemplateId] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [previewItem, setPreviewItem] = useState(null);
  const { data: docs, isLoading } = useQuery({ queryKey: ['documents', user.id, selectedCycleId], queryFn: () => api(`/documents?student_id=${user.id}&cycle_id=${selectedCycleId}`), enabled: !!selectedCycleId });
  const { data: research } = useQuery({ queryKey: ['my-research-context', user.id, selectedCycleId], queryFn: () => api(`/research/dashboard/${user.id}?cycle_id=${selectedCycleId}`), enabled: !!selectedCycleId, retry: false });
  const { data: selfInternships = [] } = useQuery({ queryKey: ['my-self-internships', selectedCycleId], queryFn: () => api(`/self-internships?cycle_id=${selectedCycleId}`), enabled: !!selectedCycleId });
  const { data: opportunityApplications = [] } = useQuery({ queryKey: ['my-opportunity-applications', selectedCycleId], queryFn: () => api(`/opportunities/my-applications?cycle_id=${selectedCycleId}`), enabled: !!selectedCycleId });
  const { data: reportDeadlines = [], error: deadlinesError } = useQuery({ queryKey: ['my-report-deadlines', selectedCycleId], queryFn: () => api(`/report-deadlines/my?cycle_id=${selectedCycleId}`), enabled: !!selectedCycleId, retry: false });
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

  if (!selectedCycleId) return <div className="max-w-3xl"><PageHeader breadcrumb={[{ label: 'Home', to: '/student' }, { label: 'Documents' }]} eyebrow="Documents" title="No open cycle yet" description="Report uploads open after CRCS publishes a cycle and enrolls you." /></div>;
  return (
    <div className="max-w-7xl space-y-6">
      <PageHeader
        breadcrumb={[{ label: 'Home', to: '/student' }, { label: 'Documents' }]}
        eyebrow={`Documents · ${selectedCycle?.name ?? 'Selected cycle'}`}
        title="Upload and track your reports"
        description="Guidelines stay beside your upload workspace so you can review a format and submit a report without leaving the page."
      />
      {waitingForMentor.length > 0 && (
        <div className="inline-notice flex items-start gap-2 border-amber-200 bg-amber-50 text-amber-900">
          <WarningCircle size={16} weight="fill" className="mt-0.5 shrink-0" />
          <div><p className="font-semibold">Waiting for faculty mentor allocation</p><p className="mt-1">{waitingForMentor.join(', ')} {waitingForMentor.length === 1 ? 'is' : 'are'} approved. CRCS will allocate a faculty mentor before document uploads open.</p></div>
        </div>
      )}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(360px,0.9fr)_minmax(460px,1.1fr)]">
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="flex items-center gap-2 font-bold"><FileText size={18} weight="light" />Guidelines, formats and samples</h2>
            <p className="form-help mb-4">Open any standard in a preview window without leaving the portal.</p>
            {standards.length ? (
              <div className="space-y-3">
                {standards.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                    <div className="min-w-0"><p className="truncate font-semibold text-ink">{item.title}</p><p className="mt-1 text-xs capitalize text-slate-500">{item.category}</p></div>
                    {item.url && <Button variant="secondary" className="shrink-0 px-3 py-1.5 text-xs" onClick={() => setPreviewItem(item)}><Eye size={14} weight="light" />Preview</Button>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">CRCS has not published programme documents yet.</p>
            )}
          </Card>
          {reportDeadlines.length > 0 && (
            <Card className="p-6">
              <h2 className="font-bold">Report deadline reminders</h2>
              <p className="form-help mb-4">Your mentor-set deadlines appear here.</p>
              <div className="space-y-3">
                {reportDeadlines.map((deadline) => {
                  const overdue = new Date(deadline.due_at) < new Date();
                  return (
                    <div key={deadline.id} className="flex flex-col justify-between gap-2 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center">
                      <div><p className="font-semibold text-ink">{deadline.title}</p><p className="text-sm text-slate-600">Due {new Date(deadline.due_at).toLocaleString()}</p></div>
                      <Badge status={overdue ? 'rejected' : 'pending'}>{overdue ? 'overdue' : 'upcoming'}</Badge>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="flex items-center gap-2 font-bold"><UploadSimple size={18} weight="light" />Upload a document</h2>
            <p className="form-help mb-5">PDF, Word, and presentation files work best. Attach documents to an approved internship report deadline.</p>
            {!approvedRecords.length ? (
              <div className="inline-notice border-amber-200 bg-amber-50 text-amber-900">This upload area is locked until CRCS approves an internship application and allocates a faculty mentor. You can still preview guidelines and view your submitted documents below.</div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <Label>Approved internship record</Label>
                  <Select value={selectedRecordKey || (approvedRecords.length === 1 ? approvedRecords[0].key : '')} onChange={(event) => { setSelectedRecordKey(event.target.value); setReportDeadlineId(''); setReportTemplateId(''); }} required>
                    {approvedRecords.length > 1 && <option value="">Select your approved internship</option>}
                    {approvedRecords.map((record) => <option key={record.key} value={record.key}>{record.label}</option>)}
                  </Select>
                  {selectedRecord && <p className="form-help mt-2">{selectedRecord.detail}</p>}
                </div>
                {selectedRecord && (
                  <div>
                    <Label>Faculty report deadline</Label>
                    <Select value={reportDeadlineId} onChange={(event) => { const deadline = relevantDeadlines.find((item) => item.id === event.target.value); setReportDeadlineId(event.target.value); setReportTemplateId(deadline?.report_template_id ?? ''); }} required>
                      <option value="">Select the report deadline</option>
                      {relevantDeadlines.filter((deadline) => new Date(deadline.due_at) >= new Date()).map((deadline) => <option key={deadline.id} value={deadline.id}>{deadline.title} — due {new Date(deadline.due_at).toLocaleString()}</option>)}
                    </Select>
                    {!relevantDeadlines.length && <p className="mt-2 text-sm text-amber-700">Your mentor has not set a report deadline yet. Uploading is locked until one is set.</p>}
                    {deadlinesError && <p className="mt-2 text-sm text-red-600">{deadlinesError.message}</p>}
                    {selectedRequirement && (
                      <p className="mt-2 rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-900">
                        <span className="font-semibold">Required report:</span> {selectedRequirement.title} · assessed out of {selectedRequirement.max_marks}
                        {selectedRequirement.guidance_document?.url && <> · <button type="button" className="font-semibold underline" onClick={() => setPreviewItem(selectedRequirement.guidance_document)}>Preview guidance</button></>}
                      </p>
                    )}
                  </div>
                )}
                <div><Label>File</Label><input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="mt-1 block w-full rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-600" /></div>
                <div><Label>Week number (weekly reports only)</Label><Input type="number" value={weekNumber} onChange={(event) => setWeekNumber(event.target.value)} /></div>
                <div><Label>Report template (optional)</Label><Select value={reportTemplateId} onChange={(event) => setReportTemplateId(event.target.value)} disabled={Boolean(selectedDeadline?.report_template_id)}><option value="">General document</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</Select></div>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <Button type="submit" disabled={busy || !selectedRecord}><UploadSimple size={16} weight="bold" />{busy ? 'Uploading…' : 'Upload document'}</Button>
              </form>
            )}
          </Card>
          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <div><h2 className="font-bold">My documents</h2><p className="form-help">Preview your uploaded reports and read mentor feedback here.</p></div>
              <Badge status="approved">{docs?.length ?? 0} files</Badge>
            </div>
            {isLoading && (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            )}
            <ul className="space-y-2">
              {docs?.map((doc) => (
                <li key={doc.id} className="flex items-center justify-between gap-4 border-b border-slate-100 py-3 text-sm last:border-0">
                  <div className="min-w-0 flex items-center gap-2">
                    <FileText size={16} weight="light" className="shrink-0 text-slate-400" />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-800">{doc.file_name}</p>
                      {doc.review_comment && <p className="mt-1 truncate text-xs text-amber-800">Mentor feedback: {doc.review_comment}</p>}
                    </div>
                  </div>
                  {doc.url && <Button variant="secondary" className="shrink-0 px-3 py-1.5 text-xs" onClick={() => setPreviewItem({ ...doc, title: doc.file_name })}><Eye size={14} weight="light" />Open</Button>}
                </li>
              ))}
              {!isLoading && !docs?.length && <li><EmptyState icon={FileText} title="No documents uploaded yet" description="Your submitted reports and supporting files will appear here." /></li>}
            </ul>
          </Card>
        </div>
      </div>
      <PreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />
    </div>
  );
}
