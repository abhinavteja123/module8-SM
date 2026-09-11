import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Card } from '../../components/ui/card.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Button } from '../../components/ui/button.jsx';
import { PageHeader, EmptyState } from '../../components/ui/page.jsx';
import { ProjectBrowser } from './ProjectListing.jsx';
import { useCycle } from '../../cycles/CycleContext.jsx';

export default function ResearchDashboard() {
  const { user } = useAuth();
  const { selectedCycle, selectedCycleId } = useCycle();
  const { data, isLoading, error } = useQuery({
    queryKey: ['research-dashboard', user.id, selectedCycleId],
    queryFn: () => api(`/research/dashboard/${user.id}?cycle_id=${selectedCycleId}`),
    enabled: !!selectedCycleId,
    retry: false,
  });
  const { data: allApplications = [] } = useQuery({ queryKey: ['my-all-applications', selectedCycleId], queryFn: () => api(`/students/me/applications?cycle_id=${selectedCycleId}`), enabled: !!selectedCycleId });

  if (!selectedCycleId) return <EmptyState title="No open cycle yet" description="Research applications open after CRCS publishes a cycle and enrolls you." />;
  if (isLoading) return <div className="loading-state">Loading your research internship…</div>;
  const applications = allApplications.filter((item) => item.pathway === 'research');

  const { documents = [] } = data ?? {};
  const hasApplications = !error && applications.length > 0;
  const approved = applications.find((item) => item.status === 'crcs_approved');

  return (
    <div className="max-w-5xl space-y-6"><PageHeader eyebrow={`Research internship · ${selectedCycle.name}`} title="My research internship" description="Follow your application, mentor assignment, and document reviews from this page." />
      {!hasApplications ? <EmptyState title="No active research internship yet" description="Choose an available faculty research project below to apply." /> : <Card className="flex flex-wrap items-center justify-between gap-3 p-4"><div><h2 className="font-bold text-slate-950">Submitted applications</h2><p className="mt-1 text-sm text-slate-600">See status, mentor details, and revoke a pending application from one place.</p></div><Link to="/student/applications"><Button variant="secondary">Open My Applications</Button></Link></Card>}
      {approved && <Card className="border-emerald-200 bg-emerald-50 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-bold text-emerald-950">Approved research internship</p><p className="mt-1 text-sm text-emerald-900">{approved.title ?? 'Research project'} · {approved.subtitle ?? 'Faculty mentor assigned after approval'}</p></div><Badge status="approved">Approved</Badge></div></Card>}

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
