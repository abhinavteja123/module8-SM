import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Card } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Label } from '../../components/ui/label.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { PageHeader, EmptyState } from '../../components/ui/page.jsx';
import { useCycle } from '../../cycles/CycleContext.jsx';

function ApplicationProgress({ application }) {
  const completedByStatus = { applied: 1, under_review: 2, offered: 3, crcs_approved: 4 };
  const steps = ['Application submitted', 'Under review', 'Offer received', 'CRCS approved'];
  const completed = completedByStatus[application.status] ?? 0;
  const isRejected = ['rejected', 'revoked'].includes(application.status);
  return <Card className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold text-slate-950">{application.opportunity?.title ?? 'CRCS opportunity'}</h2><p className="mt-1 text-sm text-slate-600">{application.opportunity?.organization_name ?? 'Opportunity application'}</p></div><Badge status={application.status}>{application.status.replaceAll('_', ' ')}</Badge></div>{isRejected ? <p className="mt-4 text-sm text-slate-700">This application was {application.status}. {application.rejection_reason ? `Reason: ${application.rejection_reason}` : ''}</p> : <ol className="mt-5 grid gap-3 sm:grid-cols-4">{steps.map((step, index) => { const done = index < completed; const current = index === completed - 1; return <li key={step} className={`rounded-lg border p-3 text-sm ${done ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-slate-50 text-slate-400'}`}><span className="mr-2 font-bold">{done ? '✓' : index + 1}</span><span className={current ? 'font-semibold' : ''}>{step}</span></li>; })}</ol>}{application.status === 'crcs_approved' && <p className={`mt-4 rounded-lg p-3 text-sm font-medium ${application.mentor ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>{application.mentor ? `Your internship is approved. Faculty mentor allocated: ${application.mentor.full_name}. Your document workspace is now available.` : 'Your internship is approved. Please wait while CRCS allocates your faculty mentor. Document uploads will unlock after allocation.'}</p>}</Card>;
}

export default function OpportunityListPage() {
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState(null);
  const [answers, setAnswers] = useState('');
  const [resume, setResume] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const { selectedCycleId } = useCycle();
  const { data: opportunities = [], isLoading, error } = useQuery({ queryKey: ['opportunities', selectedCycleId], queryFn: () => api(`/opportunities?cycle_id=${selectedCycleId}`), enabled: !!selectedCycleId });
  const { data: myApplications = [] } = useQuery({ queryKey: ['my-opportunity-applications', selectedCycleId], queryFn: () => api(`/opportunities/my-applications?cycle_id=${selectedCycleId}`), enabled: !!selectedCycleId });
  const { data: internshipStatus } = useQuery({ queryKey: ['my-internship-status'], queryFn: () => api('/students/me/internship-status'), retry: false });
  const progressApplications = myApplications.filter((application) => application.status !== 'revoked');
  const apply = useMutation({
    mutationFn: async (opportunityId) => {
      const application = await api(`/opportunities/${opportunityId}/apply`, { method: 'POST', body: { application_answers: answers.trim() ? { response: answers.trim() } : undefined } });
      if (resume) {
        const form = new FormData(); form.append('file', resume); form.append('upload_purpose', 'application_resume'); form.append('related_entity_type', 'opportunity_application'); form.append('related_entity_id', application.id);
        const document = await api('/documents/upload', { method: 'POST', body: form, isFormData: true });
        try { await api(`/opportunities/applications/${application.id}/details`, { method: 'PATCH', body: { resume_doc_id: document.id } }); } catch (error) { if (!String(error.message).includes('migration')) throw error; }
      }
      return application;
    },
    onSuccess: () => { setFeedback('Application submitted successfully.'); setActiveId(null); setAnswers(''); setResume(null); queryClient.invalidateQueries({ queryKey: ['my-opportunity-applications', selectedCycleId] }); queryClient.invalidateQueries({ queryKey: ['my-internship-status'] }); },
    onError: (error) => setFeedback(error.message),
  });
  const withdraw = useMutation({
    mutationFn: (applicationId) => api(`/opportunities/applications/${applicationId}/withdraw`, { method: 'PATCH' }),
    onSuccess: () => {
      setFeedback('Application withdrawn successfully.');
      queryClient.invalidateQueries({ queryKey: ['my-opportunity-applications', selectedCycleId] });
    },
    onError: (error) => setFeedback(error.message),
  });
  const appliedFor = (id) => myApplications.find((application) => application.opportunity_id === id);
  const canWithdraw = (application) => ['applied', 'under_review'].includes(application.status);
  const internshipApproved = Boolean(internshipStatus?.approved);
  if (isLoading) return <div className="loading-state">Loading available opportunities…</div>;
  if (error) return <div className="inline-notice border-red-200 bg-red-50 text-red-700">Opportunities could not be loaded. {error.message}</div>;
  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader eyebrow="Student opportunities" title="Find your next internship" description="Review the role, check eligibility, then apply with an optional note and resume." />
      {feedback && <div role="status" className={`inline-notice ${feedback.includes('successfully') ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>{feedback}</div>}
      {internshipApproved && <div className="inline-notice border-emerald-200 bg-emerald-50 text-emerald-900">CRCS has already approved your internship. Applying to another opportunity is unavailable.</div>}
      {progressApplications.length > 0 && <section className="space-y-3"><div><h2 className="text-lg font-bold text-slate-950">My application progress</h2><p className="mt-1 text-sm text-slate-600">Track each current CRCS opportunity application from submission to final approval.</p></div><div className="grid gap-4">{progressApplications.map((application) => <ApplicationProgress key={application.id} application={application} />)}</div></section>}
      {!opportunities.length && <EmptyState title="No opportunities are open right now" description="New CRCS opportunities will appear here as soon as they are published." />}
      <div className="grid gap-4">{opportunities.map((opportunity) => { const application = appliedFor(opportunity.id); const isActive = activeId === opportunity.id; const availability = opportunity.application_status ?? 'open'; const canApply = !application && !internshipApproved && availability === 'open'; const availabilityLabel = availability === 'expired' ? 'Deadline passed' : 'Applications closed'; return <Card key={opportunity.id} className="p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">{opportunity.title}</h2>{application ? <Badge status={application.status} /> : availability !== 'open' && <Badge status={availability === 'closed' ? 'rejected' : 'revoked'}>{availabilityLabel}</Badge>}</div><p className="text-sm font-medium text-indigo-700">{opportunity.organization_name}</p><p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{opportunity.description || 'No description provided.'}</p><div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">{opportunity.eligibility && <span>Eligibility: {opportunity.eligibility}</span>}{opportunity.application_deadline && <span>Deadline: {new Date(opportunity.application_deadline).toLocaleDateString()}</span>}</div>{opportunity.application_url && <a href={opportunity.application_url} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-medium text-indigo-700 underline">Open application link ↗</a>}</div><div className="flex shrink-0 flex-col items-end gap-2">{application ? <><span className="text-sm text-slate-500">Application {application.status.replaceAll('_', ' ')}</span>{canWithdraw(application) && <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => { if (window.confirm('Withdraw this application? This cannot be undone.')) withdraw.mutate(application.id); }} disabled={withdraw.isPending}>{withdraw.isPending ? 'Withdrawing…' : 'Withdraw application'}</Button>}</> : canApply ? <Button onClick={() => { setActiveId(isActive ? null : opportunity.id); setFeedback(null); }}>{isActive ? 'Close' : 'Apply now'}</Button> : <span className="text-sm font-medium text-slate-500">{availability === 'expired' ? 'Deadline has passed' : 'Applications are closed'}</span>}</div></div>{isActive && canApply && <form className="mt-5 grid gap-4 border-t border-slate-100 pt-5" onSubmit={(event) => { event.preventDefault(); apply.mutate(opportunity.id); }}><div><Label>Why are you a good fit? <span className="font-normal text-slate-400">(optional)</span></Label><textarea value={answers} onChange={(event) => setAnswers(event.target.value)} className="min-h-28 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Share your motivation or answer any employer questions." /></div><div><Label>Resume / CV <span className="font-normal text-slate-400">(optional)</span></Label><Input type="file" accept=".pdf,.doc,.docx" onChange={(event) => setResume(event.target.files?.[0] ?? null)} /></div><Button type="submit" disabled={apply.isPending}>{apply.isPending ? 'Submitting…' : 'Submit application'}</Button></form>}</Card>; })}</div>
    </div>
  );
}
