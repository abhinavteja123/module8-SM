import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Card } from '../../components/ui/card.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Button } from '../../components/ui/button.jsx';

export default function ResearchDashboard() {
  const { user } = useAuth();
  const { data, isLoading, error } = useQuery({
    queryKey: ['research-dashboard', user.id],
    queryFn: () => api(`/research/dashboard/${user.id}`),
    retry: false,
  });

  if (isLoading) return <p>Loading…</p>;
  if (error || !data?.project) {
    return (
      <Card className="max-w-lg p-6">
        <p className="text-sm text-slate-500 mb-3">No active research internship yet.</p>
        <Link to="/student/research/browse"><Button>Browse Projects</Button></Link>
      </Card>
    );
  }

  const { project, research_application, mentor_assignment, documents = [] } = data;

  return (
    <div className="space-y-4 max-w-2xl">
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">{project.title}</h1>
          {research_application && <Badge status={research_application.status} />}
        </div>
        <p className="text-sm text-slate-600 mt-1">{project.description}</p>
        {mentor_assignment && (
          <p className="text-sm text-slate-500 mt-2">Mentor assignment: {mentor_assignment.faculty_id}</p>
        )}
        {research_application?.status === 'rejected' && (
          <p className="text-sm text-red-600 mt-2">
            Rejected at {research_application.rejected_at_stage} stage
            {research_application.rejection_reason ? `: ${research_application.rejection_reason}` : ''}
          </p>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="font-medium mb-2">Documents</h2>
        {documents.length === 0 && <p className="text-sm text-slate-500">No documents uploaded yet.</p>}
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
