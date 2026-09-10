import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Card } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Label } from '../../components/ui/label.jsx';
import { Select } from '../../components/ui/select.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { PageHeader, EmptyState } from '../../components/ui/page.jsx';
import { useCycle } from '../../cycles/CycleContext.jsx';
import MentorDetails from '../../components/MentorDetails.jsx';

const pathwayLabel = { research: 'Research', crcs_opportunity: 'CRCS internship', self_internship: 'Self-internship' };
const pathwayLink = { research: '/student/research', crcs_opportunity: '/student/opportunities', self_internship: '/student/self-internship' };
const canRevoke = (item) => ({ research: ['pending_faculty', 'pending_crcs_approval'], crcs_opportunity: ['applied', 'under_review', 'offered'], self_internship: ['submitted', 'mentor_approved', 'crcs_approved'] })[item.pathway]?.includes(item.status);
const revokeUrl = (item) => item.pathway === 'research' ? `/research/applications/${item.id}/withdraw` : item.pathway === 'self_internship' ? `/self-internships/${item.id}/withdraw` : `/opportunities/applications/${item.id}/withdraw`;

export default function MyOpportunityApplicationsPage() {
  const queryClient = useQueryClient();
  const { selectedCycleId } = useCycle();
  const [pathwayFilter, setPathwayFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [offerApplicationId, setOfferApplicationId] = useState(null);
  const [offerDetails, setOfferDetails] = useState('');
  const [offerFile, setOfferFile] = useState(null);
  const [feedback, setFeedback] = useState('');
  const { data: applications = [], isLoading, error } = useQuery({ queryKey: ['my-all-applications', selectedCycleId], queryFn: () => api(`/students/me/applications?cycle_id=${selectedCycleId}`), enabled: !!selectedCycleId });
  const refresh = () => { queryClient.invalidateQueries({ queryKey: ['my-all-applications', selectedCycleId] }); queryClient.invalidateQueries({ queryKey: ['my-opportunity-applications', selectedCycleId] }); queryClient.invalidateQueries({ queryKey: ['my-self-internships', selectedCycleId] }); queryClient.invalidateQueries({ queryKey: ['my-internship-status'] }); };
  const revoke = useMutation({ mutationFn: (item) => api(revokeUrl(item), { method: 'PATCH' }), onSuccess: () => { setFeedback('Application revoked successfully.'); refresh(); }, onError: (err) => setFeedback(err.message) });
  const submitOffer = useMutation({
    mutationFn: async (applicationId) => {
      if (!offerFile) throw new Error('Upload the company offer letter first.');
      const body = new FormData(); body.append('file', offerFile); body.append('upload_purpose', 'open_source_offer_letter'); body.append('related_entity_type', 'opportunity_application'); body.append('related_entity_id', applicationId);
      const document = await api('/documents/upload', { method: 'POST', body, isFormData: true });
      return api(`/opportunities/applications/${applicationId}/external-offer`, { method: 'PATCH', body: { offer_letter_doc_id: document.id, offer_details: offerDetails } });
    },
    onSuccess: () => { setFeedback('Offer letter and details sent to CRCS for review.'); setOfferApplicationId(null); setOfferDetails(''); setOfferFile(null); refresh(); },
    onError: (err) => setFeedback(err.message),
  });
  const visible = applications.filter((item) => (!pathwayFilter || item.pathway === pathwayFilter) && (!statusFilter || item.status === statusFilter));
  if (isLoading) return <div className="loading-state">Loading your applications…</div>;
  if (error) return <div className="inline-notice border-red-200 bg-red-50 text-red-700">Applications could not be loaded. {error.message}</div>;
  return <div className="max-w-4xl space-y-6"><PageHeader eyebrow="Student applications" title="My applications" description="See every research, CRCS, and self-internship application you submitted for this cycle." />
    {feedback && <div role="status" className={`inline-notice ${feedback.includes('successfully') || feedback.includes('sent') ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>{feedback}</div>}
    <Card className="p-4"><div className="grid gap-3 sm:grid-cols-2"><Select aria-label="Filter applications by pathway" value={pathwayFilter} onChange={(event) => setPathwayFilter(event.target.value)}><option value="">All pathways</option><option value="research">Research</option><option value="crcs_opportunity">CRCS internships</option><option value="self_internship">Self-internships</option></Select><Select aria-label="Filter applications by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option><option value="pending_faculty">Waiting for faculty</option><option value="pending_crcs_approval">Waiting for CRCS</option><option value="applied">Applied</option><option value="under_review">Under review</option><option value="offered">Offer submitted</option><option value="submitted">Self-internship submitted</option><option value="crcs_approved">CRCS approved</option><option value="active">Active</option><option value="rejected">Rejected</option><option value="revoked">Revoked</option></Select></div></Card>
    {!applications.length ? <EmptyState title="No applications submitted yet" description="You can apply to research, CRCS, or self-internship pathways. Each submission will remain here when you change preference." /> : !visible.length ? <EmptyState title="No applications match these filters" description="Try a different pathway or status." action={<Button variant="secondary" onClick={() => { setPathwayFilter(''); setStatusFilter(''); }}>Clear filters</Button>} /> : <div className="space-y-4">{visible.map((item) => { const external = item.pathway === 'crcs_opportunity' && item.opportunity_type === 'open_source'; const offerOpen = offerApplicationId === item.id; const canSubmitOffer = external && canRevoke(item); return <Card key={`${item.pathway}-${item.id}`} className="p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row"><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-bold text-slate-950">{item.title}</h2><Badge status={item.pathway === 'research' ? 'pending' : item.pathway === 'self_internship' ? 'approved' : external ? 'pending' : 'approved'}>{pathwayLabel[item.pathway]}</Badge>{external && <Badge status="pending">Open-source</Badge>}<Badge status={item.status}>{item.status.replaceAll('_', ' ')}</Badge></div><p className="mt-1 text-sm font-medium text-indigo-700">{item.subtitle}</p><p className="mt-3 text-sm text-slate-600">Submitted {new Date(item.created_at).toLocaleDateString()}.</p>{item.mentor && <MentorDetails mentor={item.mentor} />}{item.rejection_reason && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{item.rejection_reason}</p>}{item.pathway === 'self_internship' && item.offer_letter_doc_id && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Offer letter uploaded. This confirms the self-internship selection, so all competing pending applications were automatically revoked.</p>}{external && <p className="mt-3 text-sm text-slate-600">{item.offer_letter_doc_id ? 'Company offer letter is attached for CRCS review.' : 'Upload the company offer letter here after you are selected.'}</p>}</div><div className="flex shrink-0 flex-wrap items-start gap-2"><Link to={pathwayLink[item.pathway]}><Button variant="secondary">Open pathway</Button></Link>{canRevoke(item) && <Button variant="danger" onClick={() => { if (window.confirm('Revoke this application? This cannot be undone.')) revoke.mutate(item); }} disabled={revoke.isPending}>{revoke.isPending ? 'Revoking…' : 'Revoke application'}</Button>}</div></div>{canSubmitOffer && <div className="mt-5 border-t border-slate-100 pt-5"><Button variant="secondary" onClick={() => { setOfferApplicationId(offerOpen ? null : item.id); setFeedback(''); }}>{offerOpen ? 'Close offer upload' : item.offer_letter_doc_id ? 'Replace offer letter or details' : 'Upload offer letter'}</Button>{offerOpen && <form className="mt-4 grid gap-4 rounded-lg border border-indigo-100 bg-indigo-50 p-4" onSubmit={(event) => { event.preventDefault(); submitOffer.mutate(item.id); }}><div><Label>Company selection details</Label><textarea value={offerDetails} onChange={(event) => setOfferDetails(event.target.value)} className="mt-1 min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="State the role, offer/start date, and information CRCS should review." required /></div><div><Label>Company offer letter</Label><Input type="file" accept=".pdf,.doc,.docx" onChange={(event) => setOfferFile(event.target.files?.[0] ?? null)} required /></div><Button type="submit" disabled={submitOffer.isPending}>{submitOffer.isPending ? 'Submitting…' : 'Send offer to CRCS'}</Button></form>}</div>}</Card>; })}</div>}
  </div>;
}
