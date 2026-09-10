import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Card } from '../../components/ui/card.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Button } from '../../components/ui/button.jsx';
import { PageHeader, EmptyState } from '../../components/ui/page.jsx';
import MentorDetails from '../../components/MentorDetails.jsx';
import { ProjectBrowser } from './ProjectListing.jsx';

function applicationStatus(status) {
  const labels = {
    pending_faculty: ['Waiting for faculty', 'Your faculty mentor needs to review this application.', 'pending'],
    pending_crcs_approval: ['Waiting for approval', 'Faculty has recommended this application; CRCS decision is needed.', 'pending'],
    crcs_approved: ['Approved', 'CRCS approved this research internship.', 'approved'],
    rejected: ['Rejected', 'This application was not approved.', 'rejected'],
    revoked: ['Closed', 'This application was closed because another internship progressed.', 'revoked'],
  };
  return labels[status] ?? ['Application submitted', 'Your application has been recorded.', 'pending'];
}

export default function ResearchDashboard() {
  const { user } = useAuth();
  const { data, isLoading, error } = useQuery({
    queryKey: ['research-dashboard', user.id],
    queryFn: () => api(`/research/dashboard/${user.id}`),
    retry: false,
  });

  if (isLoading) return <div className="loading-state">Loading your research internship…</div>;
  const applications = data?.applications ?? (data?.application ? [data.application] : []);

  const { application, mentorAssignment, documents = [] } = data ?? {};
  const hasApplications = !error && applications.length > 0;

  return (
    <div className="max-w-3xl space-y-6"><PageHeader eyebrow="Research internship" title="My research internship" description="Follow your application, mentor assignment, and document reviews from this page." />
      {!hasApplications ? <EmptyState title="No active research internship yet" description="Choose an available faculty research project below to apply." /> : <section><div className="mb-3"><h2 className="text-lg font-bold text-slate-950">My applications</h2><p className="mt-1 text-sm text-slate-600">Every research application stays visible here, including applications still waiting for faculty or CRCS approval.</p></div><div className="space-y-3">{applications.map((item) => { const [label, detail, tone] = applicationStatus(item.status); return <Card key={item.id} className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-950">{item.title ?? 'Research project'}</h3><p className="mt-1 text-sm text-slate-600">{item.description}</p></div><Badge status={tone}>{label}</Badge></div><p className="mt-3 text-sm text-slate-600">{detail}</p>{mentorAssignment && item.id === application?.id && <MentorDetails mentor={mentorAssignment.mentor} />}{item.status === 'rejected' && <p className="mt-2 text-sm text-red-600">Rejected at {item.rejected_at_stage ?? 'review'} stage{item.rejection_reason ? `: ${item.rejection_reason}` : ''}</p>}</Card>; })}</div></section>}

      <ProjectBrowser />

      {hasApplications && <Card className="p-6">
        <h2 className="font-bold mb-2">Documents</h2>
        {documents.length === 0 && <p className="form-help">No documents uploaded yet.</p>}
        {documents.map((d) => (
          <div key={d.id} className="flex items-center justify-between border-t border-slate-100 py-2 first:border-t-0">
            <span className="text-sm">{d.file_name}</span>
            <Badge status={d.review_status} />
          </div>
        ))}
        <Link to="/student/documents"><Button variant="secondary" className="mt-3">Manage Documents</Button></Link>
      </Card>}
    </div>
  );
}
