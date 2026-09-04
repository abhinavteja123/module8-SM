import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Card } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Badge } from '../../components/ui/badge.jsx';

export default function ProjectListing() {
  const queryClient = useQueryClient();
  const { data: projects, isLoading, error } = useQuery({
    queryKey: ['research-projects'],
    queryFn: () => api('/research/projects'),
  });

  const apply = useMutation({
    mutationFn: (project_id) => api('/research/applications', { method: 'POST', body: { project_id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['research-projects'] }),
  });

  if (isLoading) return <p>Loading…</p>;
  if (error) return <p className="text-red-600">{error.message}</p>;

  const open = (projects ?? []).filter((p) => p.status === 'open' || p.status === 'locked');

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Research Projects</h1>
      {open.length === 0 && <p className="text-sm text-slate-500">No projects currently accepting applications.</p>}
      <div className="grid gap-3 max-w-2xl">
        {open.map((p) => (
          <Card key={p.id} className="p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">{p.title}</h2>
              <Badge status={p.status} />
            </div>
            <p className="text-sm text-slate-600 mt-1">{p.description}</p>
            <p className="text-xs text-slate-500 mt-2">{p.approved_count} / {p.max_students} students approved</p>
            <Button
              className="mt-3"
              onClick={() => apply.mutate(p.id)}
              disabled={apply.isPending}
            >
              Send Application
            </Button>
          </Card>
        ))}
      </div>
      {apply.isError && <p className="text-sm text-red-600">{apply.error.message}</p>}
    </div>
  );
}
