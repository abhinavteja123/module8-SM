import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ClipboardText, MagnifyingGlass, FileArrowDown } from '@phosphor-icons/react';
import { api } from '../../lib/api.js';
import { Badge } from '../../components/ui/badge.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Card } from '../../components/ui/card.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Dialog } from '../../components/ui/dialog.jsx';
import { EmptyState, PageHeader } from '../../components/ui/page.jsx';
import { Skeleton } from '../../components/ui/skeleton.jsx';
import { useToast } from '../../components/ui/toast.jsx';
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
  const student = application.student ?? {};
  return <Dialog open onClose={onClose} title={application.project_title} size="lg" footer={<>
    <Button variant="ghost" onClick={onClose}>Cancel</Button>
    <Button variant="danger" onClick={() => onDecide('reject', reason)} disabled={pending || !reason.trim()}>{pending ? 'Saving…' : 'Reject application'}</Button>
    <Button onClick={() => onDecide('approve', reason)} disabled={pending}>{pending ? 'Saving…' : stage === 'faculty' ? 'Send to CRCS' : 'Approve internship'}</Button>
  </>}>
    <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Decision required</p>
    <p className="mt-1 text-sm text-slate-600">Review the student and project details before recording a decision.</p>
    <div className="mt-4 grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Student</p><p className="mt-1 font-semibold text-slate-900">{application.student_name}</p><p className="text-sm text-slate-600">{application.student_email}</p><p className="text-sm text-slate-600">{student.phone ?? application.student_phone ?? 'Phone not provided'}</p></div><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Academic profile</p><p className="mt-1 text-sm font-medium text-slate-900">{student.roll_number ?? 'Roll number not provided'}</p><p className="text-sm text-slate-600">{student.department?.name ?? 'Department not provided'} · CGPA {student.cgpa ?? '—'}</p></div><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Submitted</p><p className="mt-1 text-sm font-medium text-slate-900">{dateText(application.created_at)}</p></div><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Current status</p><Badge className="mt-1" status={application.status}>{statusLabel(application.status)}</Badge></div></div>
    {(application.application_answers?.response || application.resume) && <div className="mt-4 rounded-lg bg-slate-50 p-4 text-sm">{application.application_answers?.response && <div><p className="mb-1 font-semibold text-slate-800">Why the student wants this project</p><p className="whitespace-pre-wrap text-slate-600">{application.application_answers.response}</p></div>}{application.resume?.url && <a className="mt-2 inline-flex items-center gap-1.5 font-semibold text-brand-700 underline" href={application.resume.url} target="_blank" rel="noreferrer"><FileArrowDown size={14} weight="light" />Download resume</a>}</div>}
    <div className="mt-5"><label htmlFor="decision-reason" className="text-sm font-semibold text-slate-800">Decision note <span className="font-normal text-slate-400">(required for rejection)</span></label><Input id="decision-reason" className="mt-2" placeholder="Explain a rejection so the student knows what to improve" value={reason} onChange={(event) => setReason(event.target.value)} /></div>
    {error && <p className="mt-3 text-sm text-red-700">{error.message}</p>}
  </Dialog>;
}

export default function ApplicationQueue({ stage, compact = false }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { selectedCycleId } = useCycle();
  const [search, setSearch] = useState('');
  const [selectedApplication, setSelectedApplication] = useState(null);
  const relevantStatus = stage === 'faculty' ? 'pending_faculty' : 'pending_crcs_approval';
  const query = `/research/applications?status=${relevantStatus}&cycle_id=${selectedCycleId}`;
  const { data: applications = [], isLoading, error } = useQuery({ queryKey: ['research-applications', stage, selectedCycleId], queryFn: () => api(query), enabled: !!selectedCycleId });
  const visibleApplications = useMemo(() => applications.filter((application) => [application.student_name, application.student_email, application.student?.roll_number, application.project_title].filter(Boolean).join(' ').toLowerCase().includes(search.trim().toLowerCase())), [applications, search]);
  const decisionCount = applications.filter((application) => application.status === relevantStatus).length;
  const decide = useMutation({
    mutationFn: ({ id, decision, reason }) => api(`/research/applications/${id}/${stage === 'faculty' ? 'faculty-decision' : 'crcs-decision'}`, { method: 'PATCH', body: { decision, reason: reason || undefined } }),
    onSuccess: (_data, variables) => {
      setSelectedApplication(null);
      toast.success(variables.decision === 'approve' ? 'Decision saved. The student has been notified.' : 'Application rejected and the student has been notified.');
      queryClient.invalidateQueries({ queryKey: ['research-applications'] });
    },
  });
  if (isLoading) return <div className="max-w-5xl space-y-5">{!compact && <PageHeader eyebrow="Decision desk" title={`${stage === 'faculty' ? 'Faculty' : 'CRCS'} research approvals`} description="Review student requests in a table, then open a focused decision panel when you are ready." />}<Card className="space-y-3 p-5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</Card></div>;
  if (error) return <div className="inline-notice border-red-200 bg-red-50 text-red-700">Applications could not be loaded. {error.message}</div>;

  return <div className="max-w-5xl space-y-5">{compact ? <div><h2 className="section-title">Research internship applications</h2><p className="mt-1 text-sm text-slate-600">Applications a faculty mentor has approved and sent to CRCS for final approval.</p></div> : <PageHeader breadcrumb={[{ label: 'Home', to: '/faculty' }, { label: 'Applications' }]} eyebrow="Decision desk" title={`${stage === 'faculty' ? 'Faculty' : 'CRCS'} research approvals`} description="Review student requests in a table, then open a focused decision panel when you are ready." action={<span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-700"><ClipboardText size={22} weight="light" /></span>} />}
    <Card className="p-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="font-bold">{stage === 'crcs' ? 'Research application status' : 'Pending student requests'}</h3><p className="mt-1 text-sm text-slate-600">{visibleApplications.length} of {applications.length} application{applications.length === 1 ? '' : 's'} shown</p></div><Badge status={decisionCount ? 'pending' : 'approved'}>{decisionCount} {stage === 'crcs' ? 'need CRCS approval' : 'waiting'}</Badge></div><div className="mt-4"><label className="text-sm font-semibold text-slate-800">Find a student or project</label><div className="relative mt-2"><MagnifyingGlass size={16} weight="light" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search student name, email, roll number, or project" /></div></div></Card>
    {!applications.length ? <EmptyState icon={ClipboardText} title="No research applications need a decision" description={stage === 'crcs' ? 'Applications will appear here once a faculty mentor approves and sends them to CRCS.' : 'New applications will appear here when they reach your approval stage.'} /> : !visibleApplications.length ? <EmptyState icon={MagnifyingGlass} title="No students match this search" description="Clear or adjust the search to return to the application list." action={<Button variant="secondary" onClick={() => setSearch('')}>Clear search</Button>} /> : <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}><Card className="overflow-hidden"><div className="overflow-x-auto"><table className="min-w-[760px] w-full text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-4">Student</th><th className="px-4 py-4">Research project</th><th className="px-4 py-4">Submitted</th><th className="px-4 py-4">Status</th><th className="px-5 py-4 text-right">Action</th></tr></thead><tbody>{visibleApplications.map((application) => <tr key={application.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50"><td className="px-5 py-4"><p className="font-semibold text-slate-900">{application.student_name}</p><p className="text-xs text-slate-500">{application.student_email}</p><p className="mt-1 text-xs text-slate-600">{application.student?.roll_number ?? 'No roll number'}</p></td><td className="px-4 py-4 font-medium text-slate-800">{application.project_title}</td><td className="px-4 py-4 text-slate-600">{dateText(application.created_at)}</td><td className="px-4 py-4"><Badge status={application.status}>{statusLabel(application.status)}</Badge></td><td className="px-5 py-4 text-right"><Button variant="secondary" onClick={() => setSelectedApplication(application)}>Review</Button></td></tr>)}</tbody></table></div></Card></motion.div>}
    {selectedApplication && <ReviewModal application={selectedApplication} stage={stage} onClose={() => setSelectedApplication(null)} onDecide={(decision, reason) => decide.mutate({ id: selectedApplication.id, decision, reason })} pending={decide.isPending} error={decide.error} />}
  </div>;
}
