import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Card } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Label } from '../../components/ui/label.jsx';
import { EmptyState } from '../../components/ui/page.jsx';
import { useCycle } from '../../cycles/CycleContext.jsx';

export function ProjectBrowser() {
  const { selectedCycle, selectedCycleId } = useCycle();
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState(null);
  const [answer, setAnswer] = useState('');
  const [resume, setResume] = useState(null);
  const [search, setSearch] = useState('');
  const { data: projects, isLoading, error } = useQuery({
    queryKey: ['research-projects', selectedCycle?.id],
    queryFn: () => api(`/research/projects?cycle_id=${selectedCycle.id}`),
    enabled: !!selectedCycle?.id,
  });
  const { data: internshipStatus } = useQuery({ queryKey: ['my-internship-status'], queryFn: () => api('/students/me/internship-status'), retry: false });
  const { data: myApplications = [] } = useQuery({ queryKey: ['my-all-applications', selectedCycleId], queryFn: () => api(`/students/me/applications?cycle_id=${selectedCycleId}`), enabled: !!selectedCycleId });
  const appliedProjectIds = new Set(myApplications.filter((item) => item.pathway === 'research').map((item) => item.project_id));

  const apply = useMutation({
    mutationFn: async (project_id) => {
      const application = await api('/research/applications', { method: 'POST', body: { project_id, application_answers: answer.trim() ? { response: answer.trim() } : undefined } });
      if (resume) {
        const form = new FormData();
        form.append('file', resume);
        form.append('upload_purpose', 'application_resume');
        form.append('related_entity_type', 'research_application');
        form.append('related_entity_id', application.id);
        const document = await api('/documents/upload', { method: 'POST', body: form, isFormData: true });
        await api(`/research/applications/${application.id}/details`, { method: 'PATCH', body: { resume_doc_id: document.id } });
      }
      return application;
    },
    onSuccess: () => {
      setActiveId(null);
      setAnswer('');
      setResume(null);
      queryClient.invalidateQueries({ queryKey: ['research-projects'] });
      queryClient.invalidateQueries({ queryKey: ['my-internship-status'] });
      queryClient.invalidateQueries({ queryKey: ['research-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['my-all-applications'] });
    },
  });

  if (!selectedCycleId) return <EmptyState title="No open cycle yet" description="Research projects appear after CRCS publishes a cycle and enrolls you." />;
  if (isLoading) return <div className="loading-state">Loading available research projects…</div>;
  if (error) return <div className="inline-notice border-red-200 bg-red-50 text-red-700">Projects could not be loaded. {error.message}</div>;

  const open = (projects ?? []).filter((p) => p.status === 'open' || p.status === 'locked');
  const query = search.trim().toLowerCase();
  const visible = open.filter((p) => !query || [p.title, p.description, p.faculty_name, p.department?.name, p.department_name].filter(Boolean).join(' ').toLowerCase().includes(query));
  const internshipApproved = Boolean(internshipStatus?.approved);

  return (
    <section className="mt-6 border-t border-slate-200 pt-6"><div className="mb-4"><h2 className="text-lg font-bold text-slate-950">Available research projects</h2><p className="mt-1 text-sm text-slate-600">Choose a faculty project and send your application from here.</p></div>
      <Input className="mb-4" placeholder="Search project title, faculty, department, or topic" value={search} onChange={(event) => setSearch(event.target.value)} />
      {open.length === 0 && <EmptyState title="No projects are available right now" description="New projects are posted by faculty. Please check again later." />}
      {open.length > 0 && visible.length === 0 && <EmptyState title="No projects match this search" description="Try a different faculty name." />}
      {internshipApproved && <p className="inline-notice mb-4 border-emerald-200 bg-emerald-50 text-emerald-900">CRCS has already approved your internship. Applications to other research projects are unavailable.</p>}
      <div className="space-y-3">
        {visible.map((p) => {
          const isActive = activeId === p.id;
          const applied = appliedProjectIds.has(p.id);
          return (
            <Card key={p.id} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-[200px] flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="font-medium">{p.title}</h2>
                    <Badge status={p.status} />
                  </div>
                  <p className="text-sm text-slate-600 mt-1">{p.description}</p>
                  <p className="text-xs text-slate-500 mt-1">Faculty: {p.faculty_name ?? 'Unassigned'}</p>
                </div>
                <p className="text-xs text-slate-500 whitespace-nowrap">{p.max_students - p.approved_count} place{p.max_students - p.approved_count === 1 ? '' : 's'} available</p>
                {applied ? <span className="text-sm font-medium text-slate-500">Already applied</span> : !internshipApproved && <Button
                  onClick={() => setActiveId(isActive ? null : p.id)}
                >
                  {isActive ? 'Close' : 'Send Application'}
                </Button>}
              </div>
              {isActive && !applied && !internshipApproved && <form className="mt-4 grid gap-4 border-t border-slate-100 pt-4" onSubmit={(event) => { event.preventDefault(); apply.mutate(p.id); }}>
                <div>
                  <Label>Why do you want to work on this project?</Label>
                  <textarea value={answer} onChange={(event) => setAnswer(event.target.value)} className="mt-1 min-h-28 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Share your motivation and relevant experience." />
                </div>
                <div>
                  <Label>Resume / CV <span className="font-normal text-slate-400">(optional)</span></Label>
                  <Input type="file" accept=".pdf,.doc,.docx" onChange={(event) => setResume(event.target.files?.[0] ?? null)} />
                </div>
                <Button type="submit" disabled={apply.isPending}>{apply.isPending ? 'Sending…' : 'Submit Application'}</Button>
              </form>}
            </Card>
          );
        })}
      </div>
      {apply.isSuccess && <p className="inline-notice mt-4 border-emerald-200 bg-emerald-50 text-emerald-800">Application sent. You will see the faculty and CRCS decisions in your Research page.</p>}{apply.isError && <p className="inline-notice mt-4 border-red-200 bg-red-50 text-red-700">{apply.error.message}</p>}
    </section>
  );
}

export default function ProjectListing() {
  return <ProjectBrowser />;
}
