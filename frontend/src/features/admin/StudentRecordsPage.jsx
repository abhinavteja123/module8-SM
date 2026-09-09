import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Badge } from '../../components/ui/badge.jsx';
import { Card } from '../../components/ui/card.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Select } from '../../components/ui/select.jsx';
import { EmptyState, PageHeader } from '../../components/ui/page.jsx';

const TRACKS = { research: 'Research internship', crcs_opportunity: 'CRCS opportunity', self_internship: 'Self-internship' };
const REPORTS = [['weekly', 'Weekly report'], ['midterm', 'Mid-term report'], ['synopsis', 'Synopsis'], ['final', 'Final report']];
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

function ReportCell({ report }) {
  if (!report || report.state === 'locked') return <><Badge status="revoked">Locked</Badge><p className="mt-1 max-w-32 text-xs leading-4 text-slate-500">{report?.label ?? 'No internship yet'}</p></>;
  if (report.state === 'waiting') return <><Badge status="pending">Waiting</Badge><p className="mt-1 text-xs text-slate-500">Not submitted</p></>;
  return <><Badge status="approved">{report.count} submitted</Badge><p className="mt-1 text-xs text-slate-500">Latest {new Date(report.latest_at).toLocaleDateString()}</p><div className="mt-2 space-y-1">{report.files?.map((file) => file.url ? <a key={file.id} href={file.url} target="_blank" rel="noreferrer" className="block max-w-36 truncate text-xs font-semibold text-indigo-700 hover:underline" title={file.file_name}>Open file ↗</a> : <span key={file.id} className="block max-w-36 truncate text-xs text-slate-500">{file.file_name}</span>)}</div></>;
}

export default function StudentRecordsPage() {
  const [search, setSearch] = useState('');
  const [track, setTrack] = useState('');
  const [internshipStatus, setInternshipStatus] = useState('');
  const [documents, setDocuments] = useState('');
  const { data, isLoading, error } = useQuery({ queryKey: ['admin-student-records'], queryFn: () => api('/admin/student-records') });
  const records = data?.records ?? [];
  const visibleRecords = useMemo(() => records.filter((record) => {
    const haystack = [record.student.full_name, record.student.email, record.profile?.roll_number, record.internship?.title].filter(Boolean).join(' ').toLowerCase();
    const recordTrack = record.internship?.path ?? record.preference?.track;
    return (!search.trim() || haystack.includes(search.trim().toLowerCase()))
      && (!track || recordTrack === track)
      && (!internshipStatus || (internshipStatus === 'approved' ? isApproved(record) : !isApproved(record)))
      && (!documents || (documents === 'uploaded' ? record.documents.length > 0 : record.documents.length === 0));
  }), [records, search, track, internshipStatus, documents]);
  const clearFilters = () => { setSearch(''); setTrack(''); setInternshipStatus(''); setDocuments(''); };

  return <div><PageHeader eyebrow="Student oversight" title="Student records" description="See each student's actual internship type, approval stage, document uploads, and progress across the four required report categories." />
    <Card className="p-5"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><div><label className="text-sm font-semibold text-slate-800">Search student or roll number</label><Input className="mt-2" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, email, roll number, or internship" /></div><div><label className="text-sm font-semibold text-slate-800">Internship type</label><Select className="mt-2" value={track} onChange={(event) => setTrack(event.target.value)}><option value="">All internship types</option>{Object.entries(TRACKS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></div><div><label className="text-sm font-semibold text-slate-800">Approval stage</label><Select className="mt-2" value={internshipStatus} onChange={(event) => setInternshipStatus(event.target.value)}><option value="">All stages</option><option value="approved">Approved</option><option value="waiting">Waiting or not approved</option></Select></div><div><label className="text-sm font-semibold text-slate-800">Document upload</label><Select className="mt-2" value={documents} onChange={(event) => setDocuments(event.target.value)}><option value="">All students</option><option value="uploaded">Has uploaded documents</option><option value="missing">No documents uploaded</option></Select></div></div><div className="mt-4 flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-slate-600"><span className="font-bold text-slate-900">{visibleRecords.length}</span> of {records.length} students shown{data?.cycle?.name ? ` · ${data.cycle.name}` : ''}</p><button type="button" onClick={clearFilters} className="text-sm font-bold text-indigo-700 hover:underline">Clear filters</button></div></Card>
    {isLoading ? <p className="mt-6 text-sm text-slate-500">Loading student records…</p> : error ? <p className="mt-6 text-sm text-red-700">{error.message}</p> : !visibleRecords.length ? <div className="mt-6"><EmptyState title="No students match these filters" description="Try removing a filter to see more student records." /></div> : <Card className="mt-6 overflow-hidden"><div className="overflow-x-auto"><table className="min-w-[1780px] w-full text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-4">Student</th><th className="px-4 py-4">Roll number</th><th className="px-4 py-4">Internship type</th><th className="px-4 py-4">Approval stage</th>{REPORTS.map(([, label]) => <th key={label} className="px-4 py-4">{label}</th>)}<th className="px-4 py-4">Other documents</th></tr></thead><tbody>{visibleRecords.map((record) => <tr key={record.student.id} className="align-top border-b border-slate-100 last:border-0 hover:bg-slate-50"><td className="px-5 py-4"><p className="font-semibold text-slate-900">{record.student.full_name}</p><p className="text-xs text-slate-500">{record.student.email}</p></td><td className="px-4 py-4"><p className="font-semibold text-slate-800">{record.profile?.roll_number ?? '—'}</p>{record.profile?.batch_year && <p className="mt-1 text-xs text-slate-500">Batch {record.profile.batch_year}</p>}</td><td className="px-4 py-4"><p className="font-semibold text-slate-800">{TRACKS[record.internship?.path] ?? TRACKS[record.preference?.track] ?? 'Not selected'}</p><p className="mt-1 max-w-48 text-xs text-slate-500">{record.internship?.title ?? 'No internship application yet'}</p></td><td className="px-4 py-4"><Badge status={isApproved(record) ? 'approved' : record.internship?.status === 'rejected' ? 'rejected' : 'pending'}>{internshipLabel(record.internship?.status)}</Badge>{record.preference?.created_at && <p className="mt-2 text-xs text-slate-500">Preference saved {new Date(record.preference.created_at).toLocaleDateString()}</p>}</td>{REPORTS.map(([key]) => <td key={key} className="px-4 py-4"><ReportCell report={record.reports?.[key]} /></td>)}<td className="px-4 py-4">{record.documents.length ? <><Badge status="approved">{record.documents.length} files</Badge><ul className="mt-2 space-y-1.5">{record.documents.map((document) => <li key={document.id} className="max-w-xs">{document.url ? <a href={document.url} target="_blank" rel="noreferrer" className="break-all font-medium text-indigo-700 hover:underline">{document.file_name} ↗</a> : <p className="break-all font-medium text-slate-800">{document.file_name}</p>}<p className="text-xs text-slate-500">{DOCUMENT_TYPES[document.related_entity_type] ?? 'Document'} · {document.review_status?.replaceAll('_', ' ') ?? 'pending'}</p></li>)}</ul></> : <Badge status="rejected">No uploads</Badge>}</td></tr>)}</tbody></table></div></Card>}
  </div>;
}
