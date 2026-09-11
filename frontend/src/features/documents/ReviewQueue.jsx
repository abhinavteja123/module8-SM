import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Button } from '../../components/ui/button.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Card } from '../../components/ui/card.jsx';
import { Label } from '../../components/ui/label.jsx';
import { Select } from '../../components/ui/select.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { EmptyState, PageHeader } from '../../components/ui/page.jsx';
import { documentPreviewUrl } from '../../lib/documentPreview.js';
import AttendanceBadge from '../../components/AttendanceBadge.jsx';

const formatDate = (value) => value ? new Date(value).toLocaleDateString() : '—';
const formatDateTime = (value) => value ? new Date(value).toLocaleString() : '—';

// Groups by the document's actual linked report type instead of guessing from the filename,
// so a report renamed or uploaded against a CRCS-configured requirement still lands correctly.
function categoryLabel(document) {
  return document.approval_document_type ?? document.report_template?.name ?? 'General document';
}

function FileDialog({ document, onClose }) {
  return <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><Card role="dialog" aria-modal="true" aria-label="View student file" className="max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto border-indigo-200 bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">{document.approval_document_type ?? document.report_template?.name ?? 'Student report'}</p><h2 className="mt-1 text-xl font-bold text-slate-950">{document.file_name}</h2><p className="mt-1 text-sm text-slate-600">{document.student?.full_name} · {document.internship?.title ?? 'Internship'}</p></div><Button type="button" variant="ghost" className="px-3 py-2" onClick={onClose}>Close</Button></div><div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm"><p><span className="font-semibold">Submitted:</span> {formatDate(document.uploaded_at)}</p><p className="mt-1"><span className="font-semibold">Deadline:</span> {document.deadline ? `${document.deadline.title} · ${formatDate(document.deadline.due_at)}` : 'Not linked to a deadline'}</p></div><a href={documentPreviewUrl(document)} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center justify-center rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-200">Preview file</a><p className="mt-5 text-sm text-slate-600">Use the review section below the tracker to ask the student for an update.</p></Card></div>;
}

function SubmissionsDialog({ row, onView, onClose }) {
  const grouped = useMemo(() => {
    const map = new Map();
    for (const document of row.documents) {
      const label = categoryLabel(document);
      if (!map.has(label)) map.set(label, []);
      map.get(label).push(document);
    }
    return [...map.entries()];
  }, [row]);
  return <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><Card role="dialog" aria-modal="true" aria-label="Submitted documents" className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto border-indigo-200 bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Submitted documents</p><h2 className="mt-1 text-xl font-bold text-slate-950">{row.student?.full_name ?? 'Student'}</h2><p className="mt-1 text-sm text-slate-600">{row.internship?.title ?? 'Internship'}</p></div><Button type="button" variant="ghost" className="px-3 py-2" onClick={onClose}>Close</Button></div>{!grouped.length ? <p className="mt-6 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No documents submitted for this internship yet.</p> : <div className="mt-5 space-y-4">{grouped.map(([label, documents]) => <div key={label}><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><div className="mt-2 space-y-2">{documents.map((document) => <div key={document.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{document.file_name}</p><p className="mt-1 text-xs text-slate-500">Submitted {formatDateTime(document.uploaded_at)}</p>{document.review_comment && <p className="mt-1 text-xs text-amber-800">Feedback sent: {document.review_comment}</p>}</div><Button variant="secondary" className="shrink-0 px-3 py-1.5 text-xs" onClick={() => onView(document)}>View file</Button></div>)}</div></div>)}</div>}</Card></div>;
}

function MarksDialog({ row, onClose }) {
  const [values, setValues] = useState({});
  const [status, setStatus] = useState(null);
  const queryClient = useQueryClient();
  const { data: cycle } = useQuery({ queryKey: ['cycle-current'], queryFn: () => api('/cycles/current'), retry: false });
  const { data: savedMarks, isLoading: marksLoading } = useQuery({
    queryKey: ['my-mentee-marks', row.student?.id, cycle?.id],
    queryFn: () => api(`/marks/${row.student.id}?cycle_id=${cycle.id}`),
    enabled: Boolean(row.student?.id && cycle?.id),
  });
  const requirements = savedMarks?.requirements ?? [];
  const assessedRequirements = requirements.filter((item) => Number(item.max_marks) > 0);
  useEffect(() => {
    const restored = {};
    for (const item of assessedRequirements) if (item.score != null) restored[item.id] = String(item.score);
    setValues(restored);
  }, [savedMarks, row.key]);
  const saveMarks = useMutation({
    mutationFn: () => {
      const body = { cycle_id: cycle.id };
      body.component_scores = assessedRequirements.filter((item) => values[item.id] !== undefined && values[item.id] !== '').map((item) => ({ report_requirement_id: item.id, score: Number(values[item.id]) }));
      return api(`/marks/${row.student.id}`, { method: 'PUT', body });
    },
    onSuccess: (result) => {
      queryClient.setQueryData(['my-mentee-marks', row.student.id, cycle?.id], result);
      setStatus(`Marks saved at ${new Date(result.updated_at).toLocaleString()}.`);
    },
    onError: (err) => setStatus(err.message),
  });
  return <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><Card role="dialog" aria-modal="true" aria-label="Enter student marks" className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto border-indigo-200 bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Dynamic assessment</p><h2 className="mt-1 text-xl font-bold text-slate-950">Enter marks for {row.student?.full_name}</h2><p className="mt-1 text-sm text-slate-600">{row.internship?.title ?? 'Internship'} · {cycle?.name ?? 'Current cycle'}</p></div><Button type="button" variant="ghost" className="px-3 py-2" onClick={onClose}>Close</Button></div><form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); saveMarks.mutate(); }}>{marksLoading && <p className="col-span-full text-sm text-slate-500">Loading assessment requirements…</p>}{assessedRequirements.map((item) => <div key={item.id}><Label htmlFor={`mark-${item.id}`}>{item.title} / {item.max_marks}</Label><Input id={`mark-${item.id}`} className="mt-2" type="number" min="0" max={item.max_marks} step="0.01" value={values[item.id] ?? ''} onChange={(event) => setValues((current) => ({ ...current, [item.id]: event.target.value }))} /></div>)}<div className="col-span-full flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3"><span className="text-sm font-medium text-slate-700">Attendance</span><AttendanceBadge studentId={row.student?.id} /></div>{status && <p className={`col-span-full text-sm ${saveMarks.isError ? 'text-red-700' : 'text-emerald-700'}`}>{status}</p>}<div className="col-span-full mt-2 flex items-center justify-between gap-3"><p className="text-xs text-slate-500">Saving marks locks the student’s report uploads for this internship.</p><Button type="submit" disabled={!cycle?.id || !assessedRequirements.length || saveMarks.isPending || !Object.values(values).some((value) => value !== '')}>{saveMarks.isPending ? 'Saving…' : 'Save marks'}</Button></div></form></Card></div>;
}

export default function ReviewQueue() {
  const [studentId, setStudentId] = useState('');
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [detailRow, setDetailRow] = useState(null);
  const [reviewDocumentId, setReviewDocumentId] = useState('');
  const [reviewMessage, setReviewMessage] = useState('');
  const [messageSent, setMessageSent] = useState(false);
  const [markStudent, setMarkStudent] = useState(null);
  const queryClient = useQueryClient();
  const { data: docs = [], isLoading, error } = useQuery({ queryKey: ['review-documents'], queryFn: () => api('/documents') });
  const { data: programmeDocuments = [] } = useQuery({ queryKey: ['programme-documents'], queryFn: () => api('/programme-documents') });
  const sendReviewMessage = useMutation({
    mutationFn: () => api(`/documents/${reviewDocumentId}/comment`, { method: 'PATCH', body: { comment: reviewMessage } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-documents'] });
      setReviewMessage('');
      setMessageSent(true);
    },
  });
  const students = useMemo(() => [...new Map(docs.map((document) => [document.student_id, document.student])).entries()].filter(([, student]) => student).sort(([, a], [, b]) => a.full_name.localeCompare(b.full_name)), [docs]);
  const rows = useMemo(() => {
    const groups = new Map();
    docs.filter((document) => !studentId || document.student_id === studentId).forEach((document) => {
      const key = `${document.student_id}:${document.related_entity_type}:${document.related_entity_id}`;
      if (!groups.has(key)) groups.set(key, { key, student: document.student, internship: document.internship, documents: [] });
      groups.get(key).documents.push(document);
    });
    return [...groups.values()].sort((a, b) => (a.student?.full_name ?? '').localeCompare(b.student?.full_name ?? ''));
  }, [docs, studentId]);
  const visibleDocuments = docs.filter((document) => !studentId || document.student_id === studentId);
  const guidance = programmeDocuments.filter((item) => item.audience !== 'students');
  return <div className="max-w-5xl space-y-6"><PageHeader eyebrow="Student supervision" title="Submission tracker" description="One card per student internship. Open a card to see every submitted document and enter marks." />
    {guidance.length > 0 && <Card className="p-5"><h2 className="font-bold">Programme guidance and rubrics</h2><p className="form-help mt-1">These shared standards apply to every internship cycle.</p><div className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">{guidance.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 px-3 py-2"><p className="min-w-0 truncate text-sm"><span className="font-medium text-slate-900">{item.title}</span><span className="ml-2 text-xs capitalize text-slate-400">{item.category}</span></p>{item.url && <a href={documentPreviewUrl(item)} target="_blank" rel="noreferrer"><Button variant="secondary" className="shrink-0 px-2.5 py-1 text-xs">Preview</Button></a>}</div>)}</div></Card>}
    <Card className="p-5"><div className="grid gap-4 sm:grid-cols-[1fr_auto]"><div><Label>Student</Label><Select className="mt-2" value={studentId} onChange={(event) => { setStudentId(event.target.value); setReviewDocumentId(''); setMessageSent(false); }}><option value="">All allocated students</option>{students.map(([id, student]) => <option key={id} value={id}>{student.full_name} — {student.email}</option>)}</Select></div><div className="self-end rounded-lg bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">{rows.length} internship record{rows.length === 1 ? '' : 's'}</div></div></Card>
    {isLoading && <p className="loading-state">Loading submissions from your allocated students…</p>}
    {error && <p className="inline-notice border-red-200 bg-red-50 text-red-700">Submissions could not be loaded. {error.message}</p>}
    {!isLoading && !error && !rows.length && <EmptyState title={docs.length ? 'No submissions match this student' : 'No student submissions yet'} description={docs.length ? 'Choose another student to see their records.' : 'Report uploads and approval documents will appear here automatically.'} />}
    {rows.length > 0 && <div className="space-y-3">{rows.map((row) => { const latest = row.documents[0]; return <Card key={row.key} className="p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-semibold text-slate-900">{row.student?.full_name ?? 'Student'}</p><p className="text-xs text-slate-500">{row.student?.email}</p><p className="mt-1 text-xs font-medium text-indigo-700">{row.internship?.title ?? 'Internship'}</p></div><div className="flex flex-wrap items-center gap-2"><Badge status={row.documents.length ? 'approved' : 'pending'}>{row.documents.length} file{row.documents.length === 1 ? '' : 's'}</Badge><AttendanceBadge studentId={row.student?.id} /><Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => setDetailRow(row)}>View submissions</Button><Button variant="ghost" className="px-3 py-1.5 text-xs text-indigo-700" onClick={() => setMarkStudent(row)}>Enter marks</Button></div></div>{latest && <p className="mt-3 text-xs text-slate-500">Last submitted {formatDate(latest.uploaded_at)} · {latest.file_name}</p>}</Card>; })}</div>}
    <Card className="border-indigo-100 p-6"><div><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Review and notify student</p><h2 className="mt-1 text-xl font-bold text-slate-950">Ask for an update</h2><p className="mt-1 text-sm text-slate-600">Choose a submitted file and describe exactly what the student should correct. They will receive a notification and can upload an updated file before marks are awarded.</p></div><div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto] lg:items-end"><div><Label htmlFor="review-file">Submitted file</Label><Select id="review-file" className="mt-2" value={reviewDocumentId} onChange={(event) => { setReviewDocumentId(event.target.value); setMessageSent(false); }}><option value="">Choose a submitted file</option>{visibleDocuments.map((document) => <option key={document.id} value={document.id}>{document.student?.full_name} — {document.file_name}</option>)}</Select></div><div><Label htmlFor="review-message">What should the student update?</Label><textarea id="review-message" className="mt-2 min-h-24 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" value={reviewMessage} onChange={(event) => { setReviewMessage(event.target.value); setMessageSent(false); }} placeholder="For example: Please add the work completed this week and re-upload the synopsis." /></div><Button className="lg:mb-0" onClick={() => sendReviewMessage.mutate()} disabled={!reviewDocumentId || !reviewMessage.trim() || sendReviewMessage.isPending}>{sendReviewMessage.isPending ? 'Sending…' : 'Send update request'}</Button></div>{messageSent && <p className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">Update request sent. The student has been notified.</p>}{sendReviewMessage.isError && <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">The message could not be sent. {sendReviewMessage.error.message}</p>}</Card>
    {selectedDocument && <FileDialog document={selectedDocument} onClose={() => setSelectedDocument(null)} />}
    {detailRow && <SubmissionsDialog row={detailRow} onView={setSelectedDocument} onClose={() => setDetailRow(null)} />}
    {markStudent && <MarksDialog row={markStudent} onClose={() => setMarkStudent(null)} />}
  </div>;
}
