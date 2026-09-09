import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Badge } from '../../components/ui/badge.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Card } from '../../components/ui/card.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Select } from '../../components/ui/select.jsx';
import { EmptyState } from '../../components/ui/page.jsx';

function dateText(value) {
  return value ? new Date(value).toLocaleDateString() : '—';
}

function DecisionModal({ internship, onClose, onDecide, pending, error }) {
  const [reason, setReason] = useState('');
  const { data: documents = [] } = useQuery({ queryKey: ['crcs-self-internship-documents', internship.id], queryFn: () => api(`/documents?related_entity_id=${internship.id}`) });
  const offerLetter = documents.find((document) => document.id === internship.offer_letter_doc_id);
  return <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><Card role="dialog" aria-modal="true" aria-label="Review self-internship request" className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto border-indigo-200 bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Decision required</p><h2 className="mt-1 text-xl font-bold text-slate-950">{internship.company_name}</h2><p className="mt-1 text-sm text-slate-600">Review the student's submission and supporting file before recording a decision.</p></div><Button type="button" variant="ghost" className="px-3 py-2" onClick={onClose}>Close</Button></div><div className="mt-6 grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Student</p><p className="mt-1 font-semibold text-slate-900">{internship.student?.full_name ?? 'Student'}</p><p className="text-sm text-slate-600">{internship.student?.email ?? 'Email not available'}</p></div><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Submitted</p><p className="mt-1 text-sm font-medium text-slate-900">{dateText(internship.created_at)}</p></div><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Company website</p>{internship.company_website ? <a className="mt-1 block break-all text-sm font-medium text-indigo-700 underline" href={internship.company_website} target="_blank" rel="noreferrer">{internship.company_website}</a> : <p className="mt-1 text-sm text-slate-600">Not provided</p>}</div><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Offer letter</p>{offerLetter?.url ? <a className="mt-1 text-sm font-semibold text-indigo-700 underline" href={offerLetter.url} target="_blank" rel="noreferrer">Open {offerLetter.file_name}</a> : <p className="mt-1 text-sm text-red-700">File is missing</p>}</div><div className="sm:col-span-2"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Company address</p><p className="mt-1 text-sm text-slate-700">{internship.company_address || 'Not provided'}</p></div><div className="sm:col-span-2"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">How the offer was received</p><p className="mt-1 text-sm text-slate-700">{internship.offer_source || 'Not provided'}</p></div></div><div className="mt-5"><label htmlFor="self-decision-reason" className="text-sm font-semibold text-slate-800">Decision note <span className="font-normal text-slate-400">(required for rejection)</span></label><Input id="self-decision-reason" className="mt-2" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain a rejection so the student knows what to improve" /></div><div className="mt-6 flex flex-wrap justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="danger" onClick={() => onDecide('reject', reason)} disabled={pending || !reason.trim()}>{pending ? 'Saving…' : 'Reject request'}</Button><Button onClick={() => onDecide('approve', reason)} disabled={pending}>{pending ? 'Saving…' : 'Approve internship'}</Button></div>{error && <p className="mt-3 text-sm text-red-700">{error.message}</p>}</Card></div>;
}

export default function SelfInternshipApprovalsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [documentFilter, setDocumentFilter] = useState('');
  const [selectedInternship, setSelectedInternship] = useState(null);
  const [success, setSuccess] = useState('');
  const [mentorSelections, setMentorSelections] = useState({});
  const [allocationSuccess, setAllocationSuccess] = useState('');
  const { data: internships = [], isLoading, error } = useQuery({ queryKey: ['crcs-self-internships'], queryFn: () => api('/self-internships') });
  const { data: mentorOptions = [] } = useQuery({ queryKey: ['self-internship-mentor-options'], queryFn: () => api('/self-internships/mentor-options') });
  const pending = internships.filter((item) => item.status === 'submitted');
  const waitingForMentor = internships.filter((item) => item.status === 'active' && !item.assigned_mentor_id);
  const visibleInternships = useMemo(() => pending.filter((internship) => {
    const matchesSearch = [internship.student?.full_name, internship.student?.email, internship.company_name].filter(Boolean).join(' ').toLowerCase().includes(search.trim().toLowerCase());
    const hasOfferLetter = Boolean(internship.offer_letter_doc_id);
    return matchesSearch && (!documentFilter || (documentFilter === 'complete' ? hasOfferLetter : !hasOfferLetter));
  }), [pending, search, documentFilter]);
  const decisionMutation = useMutation({
    mutationFn: ({ internshipId, decision, reason }) => api(`/self-internships/${internshipId}/crcs-decision`, { method: 'PATCH', body: { decision, reason: reason || undefined } }),
    onSuccess: (_data, variables) => {
      setSelectedInternship(null);
      setSuccess(variables.decision === 'approve'
        ? 'The student is approved and waiting for a faculty mentor.'
        : `Rejected: ${variables.reason}`);
      queryClient.invalidateQueries({ queryKey: ['crcs-self-internships'] });
      queryClient.invalidateQueries({ queryKey: ['mentor-allocations'] });
    },
  });
  const mentorAllocation = useMutation({
    mutationFn: ({ internshipId, mentorId }) => api(`/self-internships/${internshipId}/mentor`, { method: 'PATCH', body: { mentor_id: mentorId } }),
    onSuccess: (record) => {
      setAllocationSuccess(`Current mentor: ${record.mentor.full_name}.`);
      queryClient.invalidateQueries({ queryKey: ['crcs-self-internships'] });
      queryClient.invalidateQueries({ queryKey: ['mentor-allocations'] });
      queryClient.invalidateQueries({ queryKey: ['mentor-allocation-options'] });
    },
  });

  return <div className="max-w-5xl space-y-5"><Card className="p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-bold">Self-internship requests</h2><p className="mt-1 text-sm text-slate-600">Review student submissions in the table, then open one focused decision panel at a time.</p></div><div className="flex flex-wrap gap-2"><Badge status={pending.length ? 'pending' : 'approved'}>{pending.length} pending</Badge><Link to="/crcs/mentor-allocations" className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-200">{waitingForMentor.length} ready for mentor allocation →</Link></div></div><div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]"><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search student, email, or company" /><Select aria-label="Filter by offer letter status" value={documentFilter} onChange={(event) => setDocumentFilter(event.target.value)}><option value="">All offer-letter states</option><option value="complete">Offer letter attached</option><option value="missing">Offer letter missing</option></Select></div></Card>
    <div aria-live="polite">{success && <p className="inline-notice border-emerald-200 bg-emerald-50 text-emerald-800">{success}</p>}</div>
    {allocationSuccess && <p className="inline-notice border-emerald-200 bg-emerald-50 text-emerald-800">{allocationSuccess}</p>}
    {waitingForMentor.length > 0 && <Card className="p-5"><h2 className="font-bold">Allocate a faculty mentor</h2><p className="mt-1 text-sm text-slate-600">Approval is complete. Choose a direct-internship mentor so the student can receive deadlines and submit reports.</p><div className="mt-4 space-y-3">{waitingForMentor.map((internship) => { const mentorId = mentorSelections[internship.id] ?? ''; return <div key={internship.id} className="grid gap-3 rounded-lg border border-slate-200 p-4 md:grid-cols-[minmax(0,1fr)_280px_auto]"><div><p className="font-semibold text-slate-900">{internship.company_name}</p><p className="text-sm text-slate-600">{internship.student?.full_name ?? 'Student'}</p></div><Select aria-label={`Faculty mentor for ${internship.company_name}`} value={mentorId} onChange={(event) => setMentorSelections((current) => ({ ...current, [internship.id]: event.target.value }))}><option value="">Choose an available faculty mentor</option>{mentorOptions.map((mentor) => <option key={mentor.id} value={mentor.id}>{mentor.full_name} · {mentor.active_allocations ?? 0}/{mentor.allocation_limit ?? 5} students</option>)}</Select><Button onClick={() => mentorAllocation.mutate({ internshipId: internship.id, mentorId })} disabled={!mentorId || mentorAllocation.isPending}>{mentorAllocation.isPending ? 'Allocating…' : 'Allocate mentor'}</Button></div>; })}</div>{mentorAllocation.isError && <p className="mt-3 text-sm text-red-700">{mentorAllocation.error.message}</p>}</Card>}
    {isLoading ? <p className="loading-state">Loading self-internship requests…</p> : error ? <p className="inline-notice border-red-200 bg-red-50 text-red-700">{error.message}</p> : !pending.length ? <EmptyState title="No self-internship requests need a decision" description="New student submissions will appear here when they are ready for CRCS review." /> : !visibleInternships.length ? <EmptyState title="No students match these filters" description="Try a different search or offer-letter filter." action={<Button variant="secondary" onClick={() => { setSearch(''); setDocumentFilter(''); }}>Clear filters</Button>} /> : <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="min-w-[800px] w-full text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-4">Student</th><th className="px-4 py-4">Company</th><th className="px-4 py-4">Offer letter</th><th className="px-4 py-4">Submitted</th><th className="px-5 py-4 text-right">Action</th></tr></thead><tbody>{visibleInternships.map((internship) => <tr key={internship.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50"><td className="px-5 py-4"><p className="font-semibold text-slate-900">{internship.student?.full_name ?? 'Student'}</p><p className="text-xs text-slate-500">{internship.student?.email}</p></td><td className="px-4 py-4 font-medium text-slate-800">{internship.company_name}</td><td className="px-4 py-4"><Badge status={internship.offer_letter_doc_id ? 'approved' : 'rejected'}>{internship.offer_letter_doc_id ? 'Attached' : 'Missing'}</Badge></td><td className="px-4 py-4 text-slate-600">{dateText(internship.created_at)}</td><td className="px-5 py-4 text-right"><Button variant="secondary" onClick={() => { setSuccess(''); setSelectedInternship(internship); }}>Review</Button></td></tr>)}</tbody></table></div></Card>}
    {selectedInternship && <DecisionModal internship={selectedInternship} onClose={() => setSelectedInternship(null)} onDecide={(decision, reason) => decisionMutation.mutate({ internshipId: selectedInternship.id, decision, reason })} pending={decisionMutation.isPending} error={decisionMutation.error} />}
  </div>;
}
