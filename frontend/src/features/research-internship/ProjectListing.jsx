import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Card } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { PageHeader, EmptyState } from '../../components/ui/page.jsx';

export default function ProjectListing() {
  const queryClient = useQueryClient();
  const { data: projects, isLoading, error } = useQuery({
    queryKey: ['research-projects'],
    queryFn: () => api('/research/projects'),
  });
  const { data: internshipStatus } = useQuery({ queryKey: ['my-internship-status'], queryFn: () => api('/students/me/internship-status'), retry: false });

  const apply = useMutation({
    mutationFn: (project_id) => api('/research/applications', { method: 'POST', body: { project_id } }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['research-projects'] }); queryClient.invalidateQueries({ queryKey: ['my-internship-status'] }); },
  });

  if (isLoading) return <div className="loading-state">Loading available research projects…</div>;
  if (error) return <div className="inline-notice border-red-200 bg-red-50 text-red-700">Projects could not be loaded. {error.message}</div>;

  const open = (projects ?? []).filter((p) => p.status === 'open' || p.status === 'locked');
  const internshipApproved = Boolean(internshipStatus?.approved);

  return (
    <div><PageHeader eyebrow="Research internship" title="Find a project and mentor" description="Read each project, then send an application to the faculty member whose work interests you. You can track every decision in Research." />
      {open.length === 0 && <EmptyState title="No projects are available right now" description="New projects are posted by faculty. Please check again later." />}
      {internshipApproved && <p className="inline-notice mb-4 border-emerald-200 bg-emerald-50 text-emerald-900">CRCS has already approved your internship. Applications to other research projects are unavailable.</p>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {open.map((p) => (
          <Card key={p.id} className="p-5 flex flex-col">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">{p.title}</h2>
              <Badge status={p.status} />
            </div>
            <p className="text-sm text-slate-600 mt-1">{p.description}</p>
            <p className="text-xs text-slate-500 mt-3">{p.faculty_name && `Mentor: ${p.faculty_name} · `}{p.max_students - p.approved_count} place{p.max_students - p.approved_count === 1 ? '' : 's'} available</p>
            {!internshipApproved && <Button
              className="mt-5"
              onClick={() => apply.mutate(p.id)}
              disabled={apply.isPending}
            >
              Send Application
            </Button>}
          </Card>
        ))}
      </div>
      {apply.isSuccess && <p className="inline-notice mt-4 border-emerald-200 bg-emerald-50 text-emerald-800">Application sent. You will see the faculty and CRCS decisions in your Research page.</p>}{apply.isError && <p className="inline-notice mt-4 border-red-200 bg-red-50 text-red-700">{apply.error.message}</p>}
    </div>
  );
}
