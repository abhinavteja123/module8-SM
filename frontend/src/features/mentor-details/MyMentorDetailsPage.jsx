import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { useCycle } from '../../cycles/CycleContext.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Card } from '../../components/ui/card.jsx';
import { EmptyState, PageHeader } from '../../components/ui/page.jsx';
import MentorDetails from '../../components/MentorDetails.jsx';

const pathway = {
  research: { label: 'Research internship', to: '/student/research' },
  crcs_opportunity: { label: 'CRCS opportunity', to: '/student/opportunities' },
  self_internship: { label: 'Self-internship', to: '/student/self-internship' },
};

function hasAssignedMentor(application) {
  if (!application.mentor) return false;
  if (application.pathway === 'research') return application.status === 'crcs_approved';
  if (application.pathway === 'crcs_opportunity') return application.status === 'crcs_approved' && Boolean(application.assigned_mentor_id);
  return application.pathway === 'self_internship' && application.status === 'active' && Boolean(application.assigned_mentor_id);
}

export default function MyMentorDetailsPage() {
  const { selectedCycleId } = useCycle();
  const { data: applications = [], isLoading, error } = useQuery({
    queryKey: ['my-all-applications', selectedCycleId],
    queryFn: () => api(`/students/me/applications?cycle_id=${selectedCycleId}`),
    enabled: Boolean(selectedCycleId),
  });
  const allocations = applications.filter(hasAssignedMentor);

  if (isLoading) return <div className="loading-state">Checking your faculty mentor allocation…</div>;
  if (error) return <div className="inline-notice border-red-200 bg-red-50 text-red-700">Mentor details could not be loaded. {error.message}</div>;

  return <div className="max-w-4xl space-y-6"><PageHeader eyebrow="Student support" title="My mentor details" description="Your faculty mentor contact information becomes available as soon as CRCS assigns a mentor to an approved internship." />
    {!allocations.length ? <Card className="border-amber-200 bg-amber-50 p-6"><p className="text-xs font-bold uppercase tracking-widest text-amber-700">Locked until allocation</p><h2 className="mt-2 text-xl font-bold text-amber-950">No faculty mentor has been assigned yet</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-amber-900">CRCS assigns a faculty mentor after the final internship approval. When that happens, this page unlocks with the mentor’s name, official email, phone number, and cabin.</p><Link to="/student/applications"><Button variant="secondary" className="mt-5">Check My Applications</Button></Link></Card> : <section className="space-y-4">{allocations.map((application) => { const track = pathway[application.pathway]; return <Card key={`${application.pathway}-${application.id}`} className="p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Mentor allocation active</p><h2 className="mt-1 text-xl font-bold text-slate-950">{application.title}</h2><p className="mt-1 text-sm text-slate-600">{track.label}{application.subtitle ? ` · ${application.subtitle}` : ''}</p></div><Badge status="approved">Mentor assigned</Badge></div><MentorDetails mentor={application.mentor} className="mt-5" /><div className="mt-5 flex flex-wrap gap-3"><Link to={track.to}><Button variant="secondary">Open internship</Button></Link><Link to="/student/documents"><Button variant="secondary">Open documents</Button></Link></div></Card>; })}</section>}
  </div>;
}
