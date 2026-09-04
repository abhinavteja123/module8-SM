import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Card } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Label } from '../../components/ui/label.jsx';
import { Badge } from '../../components/ui/badge.jsx';

function EditableProject({ project, onSave }) {
  const locked = project.status === 'locked' || project.status === 'full';
  const [title, setTitle] = useState(project.title);
  const [description, setDescription] = useState(project.description);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <Badge status={project.status} />
        <span className="text-xs text-slate-500">{project.approved_count} / {project.max_students}</span>
      </div>
      <Label>Title</Label>
      <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={locked} className="mb-2" />
      <Label>Description</Label>
      <Input value={description} onChange={(e) => setDescription(e.target.value)} disabled={locked} className="mb-2" />
      {locked && <p className="text-xs text-amber-700 mb-2">Locked — at least one student approved, core fields are immutable.</p>}
      <Button disabled={locked} onClick={() => onSave(project.id, { title, description })}>Save</Button>
    </Card>
  );
}

export default function ProjectForm() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: projects, isLoading } = useQuery({
    queryKey: ['research-projects'],
    queryFn: () => api('/research/projects'),
  });

  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const create = useMutation({
    mutationFn: () => api('/research/projects', { method: 'POST', body: { title: newTitle, description: newDescription } }),
    onSuccess: () => {
      setNewTitle('');
      setNewDescription('');
      queryClient.invalidateQueries({ queryKey: ['research-projects'] });
    },
  });

  const update = useMutation({
    mutationFn: ({ id, body }) => api(`/research/projects/${id}`, { method: 'PATCH', body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['research-projects'] }),
  });

  if (isLoading) return <p>Loading…</p>;
  const own = (projects ?? []).filter((p) => p.faculty_id === user.id);

  return (
    <div className="space-y-6 max-w-2xl">
      <Card className="p-4">
        <h1 className="text-lg font-semibold mb-3">List a New Project</h1>
        <Label>Title</Label>
        <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="mb-2" />
        <Label>Description</Label>
        <Input value={newDescription} onChange={(e) => setNewDescription(e.target.value)} className="mb-2" />
        <Button onClick={() => create.mutate()} disabled={create.isPending || !newTitle}>
          Create Project
        </Button>
        {create.isError && <p className="text-sm text-red-600 mt-2">{create.error.message}</p>}
      </Card>

      <div className="space-y-3">
        <h2 className="font-medium">My Projects</h2>
        {own.length === 0 && <p className="text-sm text-slate-500">No projects listed yet.</p>}
        {own.map((p) => (
          <EditableProject key={p.id} project={p} onSave={(id, body) => update.mutate({ id, body })} />
        ))}
      </div>
    </div>
  );
}
