import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { useCycle } from '../../cycles/CycleContext.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Card } from '../../components/ui/card.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Select } from '../../components/ui/select.jsx';
import { EmptyState, PageHeader } from '../../components/ui/page.jsx';
import { Button } from '../../components/ui/button.jsx';

const TRACKS = { research: 'Research internship', crcs_opportunity: 'CRCS opportunity', self_internship: 'Self-internship' };
const FALLBACK_REPORTS = [['weekly', 'Weekly report'], ['midterm', 'Mid-term report'], ['synopsis', 'Synopsis'], ['final', 'Final report']];
const DOCUMENT_TYPES = { research_application: 'Research document', opportunity_application: 'Opportunity document', self_internship: 'Self-internship document' };

function internshipLabel(status) {
  const labels = {
    crcs_approved: 'Approved', active: 'Approved', pending_crcs_approval: 'Waiting for CRCS', pending_faculty: 'Waiting for faculty', submitted: 'Waiting for CRCS', applied: 'Application submitted', under_review: 'Under review', offered: 'Offer received', preference_saved: 'Preference saved', rejected: 'Rejected', revoked: 'Closed',
  };
  return labels[status] ?? status?.replaceAll('_', ' ') ?? 'No application';
}

function isApproved(record) {
  return ['crcs_approved', 'active'].includes(record.internship?.status);
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString() : '—';
}

function ReportStatus({ report, compact = false }) {
  if (!report || report.state === 'locked') return <><Badge status="revoked">Locked</Badge>{!compact && <p className="mt-1 text-xs text-slate-500">{report?.label ?? 'No internship yet'}</p>}</>;
  if (report.state === 'waiting') return <><Badge status="pending">Waiting</Badge>{!compact && <p className="mt-1 text-xs text-slate-500">Not submitted</p>}</>;
  return <><Badge status="approved">{report.count} submitted</Badge>{!compact && <p className="mt-1 text-xs text-slate-500">Latest {formatDate(report.latest_at)}</p>}</>;
}

function StudentOrganisationDialog({ record, requirements, onClose }) {
  const organisation = record.organisation ?? {};
  const people = [['School', organisation.school?.name], ['Dean', organisation.dean?.full_name], ['Department', organisation.department?.name], ['HOD', organisation.hod?.full_name], ['Faculty mentor', organisation.faculty_mentor?.full_name], ['Faculty Coordinator', organisation.faculty_coordinator?.full_name]];
  const documents = record.documents ?? [];

  return <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <Card role="dialog" aria-modal="true" aria-label={`Full record for ${record.student.full_name}`} className="max-h-[calc(100vh-2rem)] w-full max-w-5xl overflow-y-auto border-indigo-200 bg-white p-6 shadow-2xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Student record</p><h2 className="mt-1 text-xl font-bold text-slate-950">{record.student.full_name}</h2><p className="mt-1 text-sm text-slate-600">{record.profile?.roll_number ?? 'No roll number'} · {record.student.email}</p></div>
        <Button type="button" variant="ghost" className="px-3 py-2" onClick={onClose}>Close</Button>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{people.map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-sm font-semibold text-slate-900">{value ?? 'Not assigned yet'}</p></div>)}</div>
      <div className="mt-5 rounded-xl bg-indigo-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-indigo-700">Internship</p><p className="mt-1 font-semibold text-indigo-950">{TRACKS[record.internship?.path] ?? TRACKS[record.preference?.track] ?? 'Not selected'}</p><p className="mt-1 text-sm text-indigo-900">{record.internship?.title ?? 'No application submitted'} · {internshipLabel(record.internship?.status)}</p></div>
      <section className="mt-6"><h3 className="text-base font-bold text-slate-950">Required report progress</h3><div className="mt-3 overflow-hidden rounded-xl border border-slate-200"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Report</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Latest submitted</th></tr></thead><tbody className="divide-y divide-slate-100">{requirements.map(([key, label]) => { const report = record.reports?.[key]; return <tr key={key}><td className="px-4 py-3 font-medium text-slate-900">{label}</td><td className="px-4 py-3"><ReportStatus report={report} compact /></td><td className="px-4 py-3 text-slate-600">{report?.state === 'submitted' ? formatDate(report.latest_at) : '—'}</td></tr>; })}</tbody></table></div></section>
      <section className="mt-6"><div className="flex items-center justify-between gap-3"><h3 className="text-base font-bold text-slate-950">All submitted documents</h3><Badge status={documents.length ? 'approved' : 'revoked'}>{documents.length} file{documents.length === 1 ? '' : 's'}</Badge></div>{documents.length ? <div className="mt-3 overflow-hidden rounded-xl border border-slate-200"><table className="w-full table-fixed text-sm"><thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500"><tr><th className="w-[39%] px-4 py-3">Document</th><th className="w-[22%] px-4 py-3">Type</th><th className="w-[18%] px-4 py-3">Status</th><th className="w-[21%] px-4 py-3">Submitted on</th></tr></thead><tbody className="divide-y divide-slate-100">{documents.map((document) => <tr key={document.id}><td className="break-words px-4 py-3">{document.url ? <a href={document.url} target="_blank" rel="noreferrer" className="font-semibold text-indigo-700 hover:underline">{document.file_name} ↗</a> : <span className="font-medium text-slate-800">{document.file_name}</span>}</td><td className="px-4 py-3 text-slate-600">{DOCUMENT_TYPES[document.related_entity_type] ?? document.related_entity_type?.replaceAll('_', ' ') ?? 'Document'}</td><td className="px-4 py-3 capitalize text-slate-600">{document.review_status?.replaceAll('_', ' ') ?? 'Pending review'}</td><td className="px-4 py-3 text-slate-600">{formatDate(document.uploaded_at)}</td></tr>)}</tbody></table></div> : <p className="mt-3 text-sm text-slate-500">No documents have been submitted for this cycle.</p>}</section>
    </Card>
  </div>;
}

function StudentRecordRow({ record, requirements, onOpen }) {
  const internship = TRACKS[record.internship?.path] ?? TRACKS[record.preference?.track] ?? 'Not selected';
  const approvalStatus = isApproved(record) ? 'approved' : record.internship?.status === 'rejected' ? 'rejected' : 'pending';
  return <tr className="align-top hover:bg-slate-50/80">
    <td className="break-words px-3 py-4"><button type="button" className="text-left" onClick={() => onOpen(record)}><p className="font-bold text-slate-950 hover:text-indigo-700">{record.student.full_name}</p><p className="mt-0.5 text-xs text-slate-500">{record.student.email}</p><span className="mt-1 block text-xs font-bold text-indigo-700">View full record</span></button></td>
    <td className="px-3 py-4"><p className="font-semibold text-slate-800">{record.profile?.roll_number ?? '—'}</p>{record.profile?.batch_year && <p className="mt-1 text-xs text-slate-500">Batch {record.profile.batch_year}</p>}</td>
    <td className="px-3 py-4"><p className="font-semibold text-slate-800">{internship}</p><p className="mt-1 text-xs leading-4 text-slate-500">{record.internship?.title ?? 'No internship application'}</p></td>
    <td className="px-3 py-4"><Badge status={approvalStatus}>{internshipLabel(record.internship?.status)}</Badge><p className="mt-2 text-xs text-slate-500">{record.documents?.length ?? 0} document{record.documents?.length === 1 ? '' : 's'}</p></td>
    {requirements.map(([key]) => <td key={key} className="px-3 py-4"><ReportStatus report={record.reports?.[key]} compact /></td>)}
  </tr>;
}

export default function StudentRecordsPage() {
  const [search, setSearch] = useState('');
  const [track, setTrack] = useState('');
  const [internshipStatus, setInternshipStatus] = useState('');
  const [documents, setDocuments] = useState('');
  const [page, setPage] = useState(1);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const { selectedCycle, selectedCycleId } = useCycle();
  const pageSize = 25;
  const params = useMemo(() => {
    const next = new URLSearchParams({ cycle_id: selectedCycleId ?? '', page: String(page), page_size: String(pageSize) });
    if (search.trim()) next.set('search', search.trim());
    if (track) next.set('track', track);
    if (internshipStatus) next.set('status', internshipStatus);
    if (documents) next.set('documents', documents);
    return next;
  }, [selectedCycleId, page, search, track, internshipStatus, documents]);
  const { data, isLoading, error } = useQuery({ queryKey: ['admin-student-records', selectedCycleId, page, pageSize, search, track, internshipStatus, documents], queryFn: () => api(`/admin/student-records?${params}`), enabled: !!selectedCycleId, retry: false });
  const detailParams = selectedRecord ? new URLSearchParams({ cycle_id: selectedCycleId ?? '', student_id: selectedRecord.student.id, page: '1', page_size: '1' }) : null;
  const { data: detailData } = useQuery({ queryKey: ['admin-student-record-detail', selectedCycleId, selectedRecord?.student?.id], queryFn: () => api(`/admin/student-records?${detailParams}`), enabled: !!selectedRecord && !!selectedCycleId, retry: false });
  const records = data?.records ?? [];
  const total = data?.total ?? records.length;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const requirements = (data?.requirements?.length ? data.requirements.map((item) => [item.id, item.title]) : FALLBACK_REPORTS).slice(0, 8);
  const detailRecord = detailData?.records?.[0] ?? selectedRecord;
  const clearFilters = () => { setSearch(''); setTrack(''); setInternshipStatus(''); setDocuments(''); setPage(1); };
  const updateFilter = (setter) => (value) => { setter(value); setPage(1); };
  const first = total ? (page - 1) * pageSize + 1 : 0;
  const last = Math.min(page * pageSize, total);

  return <div><PageHeader eyebrow={`Student oversight${selectedCycle ? ` · ${selectedCycle.name}` : ''}`} title="Student records" description="A compact, cycle-specific table. Select a student to see their organisation map and every submitted document." />
    <Card className="p-5"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><div><label className="text-sm font-semibold text-slate-800">Search student or roll number</label><Input className="mt-2" value={search} onChange={(event) => updateFilter(setSearch)(event.target.value)} placeholder="Name, email, roll number, or internship" /></div><div><label className="text-sm font-semibold text-slate-800">Internship type</label><Select className="mt-2" value={track} onChange={(event) => updateFilter(setTrack)(event.target.value)}><option value="">All internship types</option>{Object.entries(TRACKS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></div><div><label className="text-sm font-semibold text-slate-800">Approval stage</label><Select className="mt-2" value={internshipStatus} onChange={(event) => updateFilter(setInternshipStatus)(event.target.value)}><option value="">All stages</option><option value="approved">Approved</option><option value="waiting">Waiting or not approved</option></Select></div><div><label className="text-sm font-semibold text-slate-800">Document upload</label><Select className="mt-2" value={documents} onChange={(event) => updateFilter(setDocuments)(event.target.value)}><option value="">All students</option><option value="uploaded">Has uploaded documents</option><option value="missing">No documents uploaded</option></Select></div></div><div className="mt-4 flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-slate-600">{isLoading ? 'Loading student records…' : <><span className="font-bold text-slate-900">{first}-{last}</span> of {total} students shown{data?.cycle?.name ? ` · ${data.cycle.name}` : ''}</>}</p><div className="flex items-center gap-2"><button type="button" onClick={clearFilters} className="text-sm font-bold text-indigo-700 hover:underline">Clear filters</button><Button variant="secondary" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1 || isLoading}>Previous</Button><Button variant="secondary" onClick={() => setPage((value) => Math.min(lastPage, value + 1))} disabled={page >= lastPage || isLoading}>Next</Button></div></div></Card>
    {isLoading ? <p className="mt-6 text-sm text-slate-500">Loading student records…</p> : error ? <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800"><p className="font-semibold">The paginated student-records endpoint is not ready.</p><p className="mt-1">{error.message}</p></div> : !records.length ? <div className="mt-6"><EmptyState title="No students match these filters" description="Try removing a filter to see more student records." /></div> : <Card className="mt-6 overflow-hidden"><div className="overflow-x-auto"><table className="min-w-[920px] w-full table-fixed text-sm"><thead className="bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Student</th><th className="px-3 py-3">Roll number</th><th className="px-3 py-3">Internship type</th><th className="px-3 py-3">Approval stage</th>{requirements.map(([, label]) => <th key={label} className="px-3 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{records.map((record) => <StudentRecordRow key={record.student.id} record={record} requirements={requirements} onOpen={setSelectedRecord} />)}</tbody></table></div></Card>}{selectedRecord && <StudentOrganisationDialog record={detailRecord} requirements={requirements} onClose={() => setSelectedRecord(null)} />}
  </div>;
}
