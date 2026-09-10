import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Card } from '../../components/ui/card.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Button } from '../../components/ui/button.jsx';
import { PageHeader, EmptyState } from '../../components/ui/page.jsx';
import { ProjectBrowser } from './ProjectListing.jsx';

export default function ResearchDashboard() {
  const { user } = useAuth();
  const { data, isLoading, error } = useQuery({
    queryKey: ['research-dashboard', user.id],
    queryFn: () => api(`/research/dashboard/${user.id}`),
    retry: false,
  });

  if (isLoading) return <div className="loading-state">Loading your research internship…</div>;
  const applications = data?.applications ?? (data?.application ? [data.application] : []);

  const { documents = [] } = data ?? {};
  const hasApplications = !error && applications.length > 0;

  return (
    <div className="max-w-3xl space-y-6"><PageHeader eyebrow="Research internship" title="My research internship" description="Follow your application, mentor assignment, and document reviews from this page." />
      {!hasApplications ? <EmptyState title="No active research internship yet" description="Choose an available faculty research project below to apply." /> : <Card className="flex flex-wrap items-center justify-between gap-3 p-4"><div><h2 className="font-bold text-slate-950">Submitted applications</h2><p className="mt-1 text-sm text-slate-600">See status, mentor details, and revoke a pending application from one place.</p></div><Link to="/student/applications"><Button variant="secondary">Open My Applications</Button></Link></Card>}

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
