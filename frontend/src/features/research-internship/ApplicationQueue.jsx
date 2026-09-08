import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Card } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { PageHeader, EmptyState } from '../../components/ui/page.jsx';

function StudentDetails({ student, onClose }) {
  if (!student) return null;
  const detail = (label, value) => <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-sm font-medium text-slate-900">{value ?? 'Not provided'}</p></div>;
  return <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <Card role="dialog" aria-modal="true" aria-label="Student details" className="w-full max-w-2xl border-indigo-200 bg-white p-6 shadow-2xl">
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Student profile</p><h3 className="mt-1 text-xl font-bold text-slate-950">{student.full_name}</h3><p className="mt-1 text-sm text-slate-600">{student.email}</p></div><Button type="button" variant="ghost" className="px-3 py-2" onClick={onClose}>Close</Button></div>
      <div className="mt-6 grid gap-5 rounded-xl bg-slate-50 p-5 sm:grid-cols-2">
        {detail('Roll number', student.roll_number)}
        {detail('Phone', student.phone)}
        {detail('Department', student.department?.name)}
        {detail('School', student.department?.school?.name)}
        {detail('Batch', student.batch_year)}
        {detail('CGPA', student.cgpa)}
      </div>
    </Card>
  </div>;
}

function DecisionRow({ app, onDecide, onViewStudent }) {
  const [reason, setReason] = useState('');
  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 py-4 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <button type="button" onClick={onViewStudent} className="text-left focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 rounded">
          <p className="text-sm font-medium text-indigo-700 hover:underline">{app.student_name}</p>
          <p className="text-xs text-slate-500">{app.student_email}</p>
          <p className="mt-1 text-xs font-semibold text-indigo-700">View student details →</p>
        </button>
        <Badge status={app.status} />
      </div>
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
        <Input placeholder="Reason required to reject" value={reason} onChange={(e) => setReason(e.target.value)} className="sm:w-56" />
        <Button variant="secondary" onClick={() => onDecide(app.id, 'approve', reason)}>Approve</Button>
        <Button variant="danger" onClick={() => onDecide(app.id, 'reject', reason)} disabled={!reason.trim()}>Reject</Button>
      </div>
    </div>
  );
}

export default function ApplicationQueue({ stage, compact = false }) {
  const queryClient = useQueryClient();
  const [selectedStudent, setSelectedStudent] = useState(null);
  const relevantStatus = stage === 'faculty' ? 'pending_faculty' : 'pending_crcs_approval';
  const { data: applications, isLoading, error } = useQuery({
    queryKey: ['research-applications', relevantStatus],
    queryFn: () => api(`/research/applications?status=${relevantStatus}`),
  });

  const decide = useMutation({
    mutationFn: ({ id, decision, reason }) =>
      api(`/research/applications/${id}/${stage === 'faculty' ? 'faculty-decision' : 'crcs-decision'}`, {
        method: 'PATCH',
        body: { decision, reason: reason || undefined },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['research-applications'] }),
  });

  if (isLoading) return <div className="loading-state">Loading pending applications…</div>;
  if (error) return <div className="inline-notice border-red-200 bg-red-50 text-red-700">Applications could not be loaded. {error.message}</div>;

  return (
    <div className="max-w-3xl space-y-5">
      {compact ? <div><h2 className="section-title">Research internship requests</h2><p className="mt-1 text-sm text-slate-600">Approve a faculty-reviewed application or give the student a clear reason for rejection.</p></div> : <PageHeader eyebrow="Decision desk" title={`${stage === 'faculty' ? 'Faculty' : 'CRCS'} research approvals`} description="Review applications that need your decision. Rejection reasons are shared with the student." />}
      <Card className="p-6">
      {(applications ?? []).map((app) => (
        <section key={app.id} className="border-b last:border-0 border-slate-100 py-3">
          <h2 className="font-medium">{app.project_title}</h2>
          <DecisionRow app={app} onViewStudent={() => setSelectedStudent(app.student)} onDecide={(id, decision, reason) => decide.mutate({ id, decision, reason })} />
        </section>
      ))}
      {!applications?.length && (
        <EmptyState title="No research applications need a decision" description="New applications will appear here when they reach your approval stage." />
      )}
      </Card>
      {decide.isError && <p className="text-sm text-red-600">{decide.error.message}</p>}
      {selectedStudent && <StudentDetails student={selectedStudent} onClose={() => setSelectedStudent(null)} />}
    </div>
  );
}
