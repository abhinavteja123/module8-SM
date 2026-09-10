import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Badge } from '../../components/ui/badge.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Card } from '../../components/ui/card.jsx';
import { Input } from '../../components/ui/input.jsx';
import { EmptyState, PageHeader } from '../../components/ui/page.jsx';
import { useCycle } from '../../cycles/CycleContext.jsx';

function dateText(value) {
  return value ? new Date(value).toLocaleDateString() : '—';
}

function statusLabel(status) {
  return {
    pending_faculty: 'Waiting for faculty',
    pending_crcs_approval: 'Waiting for approval',
    crcs_approved: 'Approved',
    rejected: 'Rejected',
    revoked: 'Closed',
  }[status] ?? status?.replaceAll('_', ' ') ?? 'Unknown';
}

function ReviewModal({ application, stage, onClose, onDecide, pending, error }) {
  const [reason, setReason] = useState('');
  if (!application) return null;
  const student = application.student ?? {};
  const title = stage === 'faculty' ? 'Review research application' : 'CRCS research decision';
  return <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><Card role="dialog" aria-modal="true" aria-label={title} className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto border-indigo-200 bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Decision required</p><h2 className="mt-1 text-xl font-bold text-slate-950">{application.project_title}</h2><p className="mt-1 text-sm text-slate-600">Review the student and project details before recording a decision.</p></div><Button type="button" variant="ghost" className="px-3 py-2" onClick={onClose}>Close</Button></div><div className="mt-6 grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Student</p><p className="mt-1 font-semibold text-slate-900">{application.student_name}</p><p className="text-sm text-slate-600">{application.student_email}</p></div><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Academic profile</p><p className="mt-1 text-sm font-medium text-slate-900">{student.roll_number ?? 'Roll number not provided'}</p><p className="text-sm text-slate-600">{student.department?.name ?? 'Department not provided'} · CGPA {student.cgpa ?? '—'}</p></div><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Submitted</p><p className="mt-1 text-sm font-medium text-slate-900">{dateText(application.created_at)}</p></div><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Current status</p><Badge className="mt-1" status={application.status}>{statusLabel(application.status)}</Badge></div></div><div className="mt-5"><label htmlFor="decision-reason" className="text-sm font-semibold text-slate-800">Decision note <span className="font-normal text-slate-400">(required for rejection)</span></label><Input id="decision-reason" className="mt-2" placeholder="Explain a rejection so the student knows what to improve" value={reason} onChange={(event) => setReason(event.target.value)} /></div><div className="mt-6 flex flex-wrap justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="danger" onClick={() => onDecide('reject', reason)} disabled={pending || !reason.trim()}>{pending ? 'Saving…' : 'Reject application'}</Button><Button onClick={() => onDecide('approve', reason)} disabled={pending}>{pending ? 'Saving…' : stage === 'faculty' ? 'Send to CRCS' : 'Approve internship'}</Button></div>{error && <p className="mt-3 text-sm text-red-700">{error.message}</p>}</Card></div>;
}

export default function ApplicationQueue({ stage, compact = false }) {
  const queryClient = useQueryClient();
  const { selectedCycleId } = useCycle();
  const [search, setSearch] = useState('');
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [success, setSuccess] = useState('');
  const relevantStatus = stage === 'faculty' ? 'pending_faculty' : 'pending_crcs_approval';
  const query = stage === 'faculty' ? `/research/applications?status=${relevantStatus}&cycle_id=${selectedCycleId}` : `/research/applications?cycle_id=${selectedCycleId}`;
  const { data: applications = [], isLoading, error } = useQuery({ queryKey: ['research-applications', stage, selectedCycleId], queryFn: () => api(query), enabled: !!selectedCycleId });
  const visibleApplications = useMemo(() => applications.filter((application) => [application.student_name, application.student_email, application.student?.roll_number, application.project_title].filter(Boolean).join(' ').toLowerCase().includes(search.trim().toLowerCase())), [applications, search]);
  const decisionCount = applications.filter((application) => application.status === relevantStatus).length;
  const decide = useMutation({
    mutationFn: ({ id, decision, reason }) => api(`/research/applications/${id}/${stage === 'faculty' ? 'faculty-decision' : 'crcs-decision'}`, { method: 'PATCH', body: { decision, reason: reason || undefined } }),
    onSuccess: (_data, variables) => {
      setSelectedApplication(null);
      setSuccess(variables.decision === 'approve' ? 'Decision saved. The student has been notified.' : 'Application rejected and the student has been notified.');
      queryClient.invalidateQueries({ queryKey: ['research-applications'] });
    },
  });
  if (isLoading) return <div className="loading-state">Loading pending applications…</div>;
  if (error) return <div className="inline-notice border-red-200 bg-red-50 text-red-700">Applications could not be loaded. {error.message}</div>;

  return <div className="max-w-5xl space-y-5">{compact ? <div><h2 className="section-title">Research internship applications</h2><p className="mt-1 text-sm text-slate-600">See every research application here. Only applications waiting for CRCS have a decision action.</p></div> : <PageHeader eyebrow="Decision desk" title={`${stage === 'faculty' ? 'Faculty' : 'CRCS'} research approvals`} description="Review student requests in a table, then open a focused decision panel when you are ready." />}
    <Card className="p-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="font-bold">{stage === 'crcs' ? 'Research application status' : 'Pending student requests'}</h3><p className="mt-1 text-sm text-slate-600">{visibleApplications.length} of {applications.length} application{applications.length === 1 ? '' : 's'} shown</p></div><Badge status={decisionCount ? 'pending' : 'approved'}>{decisionCount} {stage === 'crcs' ? 'need CRCS approval' : 'waiting'}</Badge></div><div className="mt-4"><label className="text-sm font-semibold text-slate-800">Find a student or project</label><Input className="mt-2" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search student name, email, roll number, or project" /></div></Card>
    <div aria-live="polite">{success && <p className="inline-notice border-emerald-200 bg-emerald-50 text-emerald-800">{success}</p>}</div>
    {!applications.length ? <EmptyState title={stage === 'crcs' ? 'No research applications yet' : 'No research applications need a decision'} description={stage === 'crcs' ? 'Student applications will remain visible here as they move through faculty and CRCS review.' : 'New applications will appear here when they reach your approval stage.'} /> : !visibleApplications.length ? <EmptyState title="No students match this search" description="Clear or adjust the search to return to the application list." action={<Button variant="secondary" onClick={() => setSearch('')}>Clear search</Button>} /> : <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="min-w-[760px] w-full text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-4">Student</th><th className="px-4 py-4">Research project</th><th className="px-4 py-4">Submitted</th><th className="px-4 py-4">Status</th><th className="px-5 py-4 text-right">Action</th></tr></thead><tbody>{visibleApplications.map((application) => <tr key={application.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50"><td className="px-5 py-4"><p className="font-semibold text-slate-900">{application.student_name}</p><p className="text-xs text-slate-500">{application.student_email}</p><p className="mt-1 text-xs text-slate-600">{application.student?.roll_number ?? 'No roll number'}</p></td><td className="px-4 py-4 font-medium text-slate-800">{application.project_title}</td><td className="px-4 py-4 text-slate-600">{dateText(application.created_at)}</td><td className="px-4 py-4"><Badge status={application.status}>{statusLabel(application.status)}</Badge></td><td className="px-5 py-4 text-right">{application.status === relevantStatus ? <Button variant="secondary" onClick={() => { setSuccess(''); setSelectedApplication(application); }}>Review</Button> : <span className="text-xs font-medium text-slate-500">{application.status === 'pending_faculty' ? 'Faculty review pending' : 'No action needed'}</span>}</td></tr>)}</tbody></table></div></Card>}
    {selectedApplication && <ReviewModal application={selectedApplication} stage={stage} onClose={() => setSelectedApplication(null)} onDecide={(decision, reason) => decide.mutate({ id: selectedApplication.id, decision, reason })} pending={decide.isPending} error={decide.error} />}
  </div>;
}
