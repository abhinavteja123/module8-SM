import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Card } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Label } from '../../components/ui/label.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Select } from '../../components/ui/select.jsx';
import { EmptyState } from '../../components/ui/page.jsx';

export default function SelfInternshipApprovalsPage() {
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState(null);
  const [reason, setReason] = useState('');
  const [mentorId, setMentorId] = useState('');
  const { data: internships = [] } = useQuery({ queryKey: ['crcs-self-internships'], queryFn: () => api('/self-internships') });
  const { data: mentors = [] } = useQuery({ queryKey: ['self-internship-mentor-options'], queryFn: () => api('/self-internships/mentor-options') });
  const { data: supportingDocuments = [] } = useQuery({ queryKey: ['crcs-self-internship-documents', activeId], queryFn: () => api(`/documents?related_entity_id=${activeId}`), enabled: !!activeId });
  const internship = internships.find((item) => item.id === activeId) ?? null;
  const pending = internships.filter((item) => item.status === 'submitted');
  const waitingForMentor = internships.filter((item) => item.status === 'active' && !item.assigned_mentor_id);
  const decisionMutation = useMutation({
    mutationFn: (decision) => api(`/self-internships/${activeId}/crcs-decision`, { method: 'PATCH', body: { decision, reason: reason || undefined } }),
    onSuccess: () => { setReason(''); queryClient.invalidateQueries({ queryKey: ['crcs-self-internships'] }); },
  });
  const allocateMutation = useMutation({
    mutationFn: () => api(`/self-internships/${activeId}/mentor`, { method: 'PATCH', body: { mentor_id: mentorId } }),
    onSuccess: () => { setMentorId(''); queryClient.invalidateQueries({ queryKey: ['crcs-self-internships'] }); },
  });

  return <Card className="max-w-2xl p-6"><div className="mb-5 flex items-start justify-between gap-4"><div><h2 className="font-bold">Self-internship approvals and mentor allocation</h2><p className="form-help">Approve or reject new submissions. After approval, allocate a faculty mentor before the student can upload reports.</p></div><Badge status={pending.length ? 'pending' : 'approved'}>{pending.length} pending · {waitingForMentor.length} waiting for mentor</Badge></div>
    {!internships.length ? <EmptyState title="No self-internship requests yet" description="New student submissions will appear here." /> : <><Label>Choose a student submission</Label><Select value={activeId ?? ''} onChange={(event) => { const id = event.target.value || null; const item = internships.find((row) => row.id === id); setActiveId(id); setReason(''); setMentorId(item?.assigned_mentor_id ?? ''); }}><option value="">Select a submission</option>{internships.map((item) => <option key={item.id} value={item.id}>{item.student?.full_name} — {item.company_name} ({item.status.replaceAll('_', ' ')})</option>)}</Select></>}
    {internship && <div className="mt-5 space-y-3 rounded-xl border border-slate-200 p-4 text-sm"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{internship.student?.full_name ?? 'Student'} — {internship.company_name}</p><p className="mt-1 text-slate-600">{internship.student?.email}</p></div><Badge status={internship.status} /></div>
      <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-sm"><p><span className="font-semibold">Company website: </span>{internship.company_website ? <a className="text-indigo-700 underline" href={internship.company_website} target="_blank" rel="noreferrer">{internship.company_website}</a> : '—'}</p><p><span className="font-semibold">Company address: </span>{internship.company_address || '—'}</p><p><span className="font-semibold">Offer received through: </span>{internship.offer_source || '—'}</p><p><span className="font-semibold">Offer letter: </span>{supportingDocuments.find((document) => document.id === internship.offer_letter_doc_id)?.url ? <a className="text-indigo-700 underline" href={supportingDocuments.find((document) => document.id === internship.offer_letter_doc_id).url} target="_blank" rel="noreferrer">View file</a> : <span className="text-red-700">Missing</span>}</p></div>
      {internship.status === 'submitted' && <><div><Label>Reason <span className="font-normal text-slate-400">(required when rejecting)</span></Label><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain why this request is rejected" /></div><div className="flex gap-2"><Button onClick={() => decisionMutation.mutate('approve')} disabled={decisionMutation.isPending}>Approve internship</Button><Button variant="danger" onClick={() => decisionMutation.mutate('reject')} disabled={decisionMutation.isPending || !reason.trim()}>Reject</Button></div></>}
      {internship.status === 'active' && <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-3"><p className="font-semibold text-indigo-950">Faculty mentor allocation</p><p className="mt-1 text-indigo-800">{internship.mentor ? `Current mentor: ${internship.mentor.full_name}.` : 'The student is approved and waiting for a faculty mentor.'}</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><Select value={mentorId} onChange={(event) => setMentorId(event.target.value)}><option value="">Choose faculty mentor</option>{mentors.map((mentor) => <option key={mentor.id} value={mentor.id}>{mentor.full_name} — {mentor.email}</option>)}</Select><Button onClick={() => allocateMutation.mutate()} disabled={!mentorId || mentorId === internship.assigned_mentor_id || allocateMutation.isPending}>{allocateMutation.isPending ? 'Allocating…' : internship.mentor ? 'Change mentor' : 'Allocate mentor'}</Button></div></div>}
      {internship.rejection_reason && <p className="text-red-600">Rejected: {internship.rejection_reason}</p>}
      {(decisionMutation.error || allocateMutation.error) && <p className="text-red-600">{decisionMutation.error?.message ?? allocateMutation.error?.message}</p>}
    </div>}
  </Card>;
}
