import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Card } from '../../components/ui/card.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Button } from '../../components/ui/button.jsx';
import { PageHeader, EmptyState } from '../../components/ui/page.jsx';

export default function ResearchDashboard() {
  const { user } = useAuth();
  const { data, isLoading, error } = useQuery({
    queryKey: ['research-dashboard', user.id],
    queryFn: () => api(`/research/dashboard/${user.id}`),
    retry: false,
  });

  if (isLoading) return <div className="loading-state">Loading your research internship…</div>;
  if (error || !data?.application) {
    return (
      <div className="max-w-2xl"><PageHeader eyebrow="Research internship" title="My research internship" description="Follow your application, mentor assignment, and document reviews from this page." /><EmptyState title="No active research internship yet" description="Browse faculty research projects to apply for an available place." action="Browse projects" to="/student/research/browse" /></div>
    );
  }

  const { application, mentorAssignment, documents = [] } = data;

  return (
    <div className="max-w-3xl space-y-6"><PageHeader eyebrow="Research internship" title="My research internship" description="Follow your application, mentor assignment, and document reviews from this page." />
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">{application.title}</h1>
          <Badge status={application.status} />
        </div>
        <p className="text-sm text-slate-600 mt-1">{application.description}</p>
        {mentorAssignment && (
          <p className="text-sm text-slate-500 mt-2">Mentor: {mentorAssignment.faculty_name ?? 'Assigned faculty mentor'}</p>
        )}
        {application?.status === 'rejected' && (
          <p className="text-sm text-red-600 mt-2">
            Rejected at {application.rejected_at_stage} stage
            {application.rejection_reason ? `: ${application.rejection_reason}` : ''}
          </p>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="font-bold mb-2">Documents</h2>
        {documents.length === 0 && <p className="form-help">No documents uploaded yet.</p>}
        {documents.map((d) => (
          <div key={d.id} className="flex items-center justify-between border-t border-slate-100 py-2 first:border-t-0">
            <span className="text-sm">{d.file_name}</span>
            <Badge status={d.review_status} />
          </div>
        ))}
        <Link to="/student/documents"><Button variant="secondary" className="mt-3">Manage Documents</Button></Link>
      </Card>
    </div>
  );
}
