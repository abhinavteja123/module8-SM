import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Button } from '../../components/ui/button.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Card } from '../../components/ui/card.jsx';
import { Label } from '../../components/ui/label.jsx';
import { Select } from '../../components/ui/select.jsx';
import { EmptyState, PageHeader } from '../../components/ui/page.jsx';

const formatDate = (value) => value ? new Date(value).toLocaleDateString() : '—';
const MARK_FIELDS = [
  ['weekly_report_score', 'Weekly report'],
  ['mid_marks', 'Mid marks'],
  ['synopsis_marks', 'Synopsis'],
  ['thesis_marks', 'Thesis'],
  ['ppt_marks', 'PPT'],
  ['viva_marks', 'Viva'],
];
const columns = [
  ['weekly', 'Weekly reports'],
  ['synopsis', 'Synopsis'],
  ['final', 'Final report'],
  ['approval', 'Approval files'],
  ['other', 'Other files'],
];

function categoryFor(document) {
  if (document.approval_document_type) return 'approval';
  const text = `${document.report_template?.name ?? ''} ${document.deadline?.title ?? ''} ${document.file_name}`.toLowerCase();
  if (text.includes('weekly')) return 'weekly';
  if (text.includes('synopsis')) return 'synopsis';
  if (/(final|thesis|viva|ppt|presentation)/.test(text)) return 'final';
  return 'other';
}

function FileDialog({ document, onClose }) {
  return <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><Card role="dialog" aria-modal="true" aria-label="View student file" className="max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto border-indigo-200 bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">{document.approval_document_type ?? document.report_template?.name ?? 'Student report'}</p><h2 className="mt-1 text-xl font-bold text-slate-950">{document.file_name}</h2><p className="mt-1 text-sm text-slate-600">{document.student?.full_name} · {document.internship?.title ?? 'Internship'}</p></div><Button type="button" variant="ghost" className="px-3 py-2" onClick={onClose}>Close</Button></div><div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm"><p><span className="font-semibold">Submitted:</span> {formatDate(document.uploaded_at)}</p><p className="mt-1"><span className="font-semibold">Deadline:</span> {document.deadline ? `${document.deadline.title} · ${formatDate(document.deadline.due_at)}` : 'Not linked to a deadline'}</p></div><a href={document.url} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center justify-center rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-200">Open file</a><p className="mt-5 text-sm text-slate-600">Use the review section below the tracker to ask the student for an update.</p></Card></div>;
}

function SubmissionCell({ documents, onView }) {
  if (!documents.length) return <span className="text-xs text-slate-400">Not submitted</span>;
  const latest = documents[0];
  return <div><p className="text-xs font-semibold text-emerald-700">Submitted{documents.length > 1 ? ` (${documents.length})` : ''}</p><p className="mt-1 break-words text-xs text-slate-600">{latest.file_name}</p><Button variant="ghost" className="mt-1 px-0 py-1 text-xs text-indigo-700" onClick={() => onView(latest)}>View file</Button></div>;
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
  useEffect(() => {
    const restored = {};
    for (const [key] of MARK_FIELDS) if (savedMarks?.[key] != null) restored[key] = String(savedMarks[key]);
    setValues(restored);
  }, [savedMarks, row.key]);
  const saveMarks = useMutation({
    mutationFn: () => {
      const body = { cycle_id: cycle.id };
      for (const [key] of MARK_FIELDS) if (values[key] !== undefined && values[key] !== '') body[key] = Number(values[key]);
      return api(`/marks/${row.student.id}`, { method: 'PUT', body });
    },
    onSuccess: (result) => {
      queryClient.setQueryData(['my-mentee-marks', row.student.id, cycle?.id], result);
      setStatus(`Marks saved at ${new Date(result.updated_at).toLocaleString()}.`);
    },
    onError: (err) => setStatus(err.message),
  });
  return <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><Card role="dialog" aria-modal="true" aria-label="Enter student marks" className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto border-indigo-200 bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Assessment</p><h2 className="mt-1 text-xl font-bold text-slate-950">Enter marks for {row.student?.full_name}</h2><p className="mt-1 text-sm text-slate-600">{row.internship?.title ?? 'Internship'} · {cycle?.name ?? 'Current cycle'}</p></div><Button type="button" variant="ghost" className="px-3 py-2" onClick={onClose}>Close</Button></div><form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); saveMarks.mutate(); }}>{marksLoading && <p className="col-span-full text-sm text-slate-500">Loading saved marks…</p>}{MARK_FIELDS.map(([key, label]) => <div key={key}><Label htmlFor={`mark-${key}`}>{label}</Label><Input id={`mark-${key}`} className="mt-2" type="number" min="0" step="0.01" value={values[key] ?? ''} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} /></div>)}{status && <p className={`col-span-full text-sm ${saveMarks.isError ? 'text-red-700' : 'text-emerald-700'}`}>{status}</p>}<div className="col-span-full mt-2 flex items-center justify-between gap-3"><p className="text-xs text-slate-500">Saving marks locks the student’s report uploads for this internship.</p><Button type="submit" disabled={!cycle?.id || saveMarks.isPending || !Object.values(values).some((value) => value !== '')}>{saveMarks.isPending ? 'Saving…' : 'Save marks'}</Button></div></form></Card></div>;
}

export default function ReviewQueue() {
  const [studentId, setStudentId] = useState('');
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [reviewDocumentId, setReviewDocumentId] = useState('');
  const [reviewMessage, setReviewMessage] = useState('');
  const [messageSent, setMessageSent] = useState(false);
  const [markStudent, setMarkStudent] = useState(null);
  const queryClient = useQueryClient();
  const { data: docs = [], isLoading, error } = useQuery({ queryKey: ['review-documents'], queryFn: () => api('/documents') });
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
      if (!groups.has(key)) groups.set(key, { key, student: document.student, internship: document.internship, weekly: [], synopsis: [], final: [], approval: [], other: [] });
      groups.get(key)[categoryFor(document)].push(document);
    });
    return [...groups.values()].sort((a, b) => (a.student?.full_name ?? '').localeCompare(b.student?.full_name ?? ''));
  }, [docs, studentId]);
  const visibleDocuments = docs.filter((document) => !studentId || document.student_id === studentId);
  return <div className="max-w-7xl space-y-6"><PageHeader eyebrow="Student supervision" title="Submission tracker" description="Each row is one student internship. The report columns show exactly what has been submitted." /><Card className="p-5"><div className="grid gap-4 sm:grid-cols-[1fr_auto]"><div><Label>Student</Label><Select className="mt-2" value={studentId} onChange={(event) => { setStudentId(event.target.value); setReviewDocumentId(''); setMessageSent(false); }}><option value="">All allocated students</option>{students.map(([id, student]) => <option key={id} value={id}>{student.full_name} — {student.email}</option>)}</Select></div><div className="self-end rounded-lg bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">{rows.length} internship record{rows.length === 1 ? '' : 's'}</div></div></Card>{isLoading && <p className="loading-state">Loading submissions from your allocated students…</p>}{error && <p className="inline-notice border-red-200 bg-red-50 text-red-700">Submissions could not be loaded. {error.message}</p>}{!isLoading && !error && !rows.length && <EmptyState title={docs.length ? 'No submissions match this student' : 'No student submissions yet'} description={docs.length ? 'Choose another student to see their records.' : 'Report uploads and approval documents will appear here automatically.'} />}{rows.length > 0 && <><Card className="overflow-hidden"><table className="w-full table-fixed text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="w-[24%] px-3 py-4">Student & internship</th>{columns.map(([, label]) => <th key={label} className="w-[15.2%] px-3 py-4">{label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.key} className="border-b border-slate-100 last:border-0 align-top hover:bg-slate-50"><td className="px-3 py-4"><button type="button" className="text-left" onClick={() => setMarkStudent(row)}><p className="font-semibold text-slate-900 hover:text-indigo-700">{row.student?.full_name ?? 'Student'}</p><p className="truncate text-xs text-slate-500">{row.student?.email}</p></button><p className="mt-2 text-xs font-medium text-indigo-700">{row.internship?.title ?? 'Internship'}</p><Button type="button" variant="ghost" className="mt-2 px-0 py-1 text-xs text-indigo-700" onClick={() => setMarkStudent(row)}>Enter marks</Button></td>{columns.map(([key]) => <td key={key} className="px-3 py-4"><SubmissionCell documents={row[key]} onView={setSelectedDocument} /></td>)}</tr>)}</tbody></table></Card><Card className="border-indigo-100 p-6"><div><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Review and notify student</p><h2 className="mt-1 text-xl font-bold text-slate-950">Ask for an update</h2><p className="mt-1 text-sm text-slate-600">Choose a submitted file and describe exactly what the student should correct. They will receive a notification and can upload an updated file before marks are awarded.</p></div><div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto] lg:items-end"><div><Label htmlFor="review-file">Submitted file</Label><Select id="review-file" className="mt-2" value={reviewDocumentId} onChange={(event) => { setReviewDocumentId(event.target.value); setMessageSent(false); }}><option value="">Choose a submitted file</option>{visibleDocuments.map((document) => <option key={document.id} value={document.id}>{document.student?.full_name} — {document.file_name}</option>)}</Select></div><div><Label htmlFor="review-message">What should the student update?</Label><textarea id="review-message" className="mt-2 min-h-24 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" value={reviewMessage} onChange={(event) => { setReviewMessage(event.target.value); setMessageSent(false); }} placeholder="For example: Please add the work completed this week and re-upload the synopsis." /></div><Button className="lg:mb-0" onClick={() => sendReviewMessage.mutate()} disabled={!reviewDocumentId || !reviewMessage.trim() || sendReviewMessage.isPending}>{sendReviewMessage.isPending ? 'Sending…' : 'Send update request'}</Button></div>{messageSent && <p className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">Update request sent. The student has been notified.</p>}{sendReviewMessage.isError && <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">The message could not be sent. {sendReviewMessage.error.message}</p>}</Card></>}{selectedDocument && <FileDialog document={selectedDocument} onClose={() => setSelectedDocument(null)} />}{markStudent && <MarksDialog row={markStudent} onClose={() => setMarkStudent(null)} />}</div>;
}
