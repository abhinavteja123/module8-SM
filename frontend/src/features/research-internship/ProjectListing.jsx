import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Card } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { EmptyState } from '../../components/ui/page.jsx';
import MentorDetails from '../../components/MentorDetails.jsx';
import { useCycle } from '../../cycles/CycleContext.jsx';

export function ProjectBrowser() {
  const { selectedCycle } = useCycle();
  const queryClient = useQueryClient();
  const { data: projects, isLoading, error } = useQuery({
    queryKey: ['research-projects', selectedCycle?.id],
    queryFn: () => api(`/research/projects?cycle_id=${selectedCycle.id}`),
    enabled: !!selectedCycle?.id,
  });
  const { data: internshipStatus } = useQuery({ queryKey: ['my-internship-status'], queryFn: () => api('/students/me/internship-status'), retry: false });

  const apply = useMutation({
    mutationFn: (project_id) => api('/research/applications', { method: 'POST', body: { project_id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['research-projects'] });
      queryClient.invalidateQueries({ queryKey: ['my-internship-status'] });
      queryClient.invalidateQueries({ queryKey: ['research-dashboard'] });
    },
  });

  if (isLoading) return <div className="loading-state">Loading available research projects…</div>;
  if (error) return <div className="inline-notice border-red-200 bg-red-50 text-red-700">Projects could not be loaded. {error.message}</div>;

  const open = (projects ?? []).filter((p) => p.status === 'open' || p.status === 'locked');
  const internshipApproved = Boolean(internshipStatus?.approved);

  return (
    <section className="mt-6 border-t border-slate-200 pt-6"><div className="mb-4"><h2 className="text-lg font-bold text-slate-950">Available research projects</h2><p className="mt-1 text-sm text-slate-600">Choose a faculty project and send your application from here.</p></div>
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
            <p className="text-xs text-slate-500 mt-3">{p.max_students - p.approved_count} place{p.max_students - p.approved_count === 1 ? '' : 's'} available</p>
            <MentorDetails mentor={p.faculty} compact />
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
    </section>
  );
}

export default function ProjectListing() {
  return <ProjectBrowser />;
}
