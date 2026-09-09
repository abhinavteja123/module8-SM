import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Card } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Label } from '../../components/ui/label.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { PageHeader, EmptyState } from '../../components/ui/page.jsx';
import UnlockRequestPanel from '../locks/UnlockRequestPanel.jsx';

function ProjectCard({ project, editing, onEdit, onCancel, onSave, onDelete, saving, deleting }) {
  const locked = project.status === 'locked' || project.status === 'full';
  const [title, setTitle] = useState(project.title);
  const [description, setDescription] = useState(project.description);
  return <Card className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-bold text-slate-950">{project.title}</h3><Badge status={project.status} /></div><p className="mt-1 text-sm text-slate-500">{project.approved_count} of {project.max_students} student places filled</p></div>{!editing && <div className="flex gap-2">{locked ? <span className="text-xs font-semibold text-amber-700">Locked after approval</span> : <Button variant="secondary" onClick={onEdit}>Edit</Button>}<Button variant="danger" onClick={onDelete} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete'}</Button></div>}</div>{editing ? <div className="mt-5 space-y-3 border-t border-slate-100 pt-4"><div><Label>Project title</Label><Input value={title} onChange={(event) => setTitle(event.target.value)} /></div><div><Label>Description</Label><textarea value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-28 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div><div className="flex gap-2"><Button onClick={() => onSave({ title: title.trim(), description: description.trim() })} disabled={saving || !title.trim() || !description.trim()}>{saving ? 'Saving…' : 'Save changes'}</Button><Button variant="secondary" onClick={onCancel} disabled={saving}>Cancel</Button></div></div> : <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{project.description}</p>}</Card>;
}

export default function ProjectForm() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: projects = [], isLoading, error: projectsError } = useQuery({ queryKey: ['research-projects'], queryFn: () => api('/research/projects') });
  const { data: cycle, error: cycleError } = useQuery({ queryKey: ['cycle-current'], queryFn: () => api('/cycles/current'), retry: false });
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [notice, setNotice] = useState(null);
  const own = projects.filter((project) => project.faculty_id === user.id);
  const atLimit = own.length >= 4;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['research-projects'] });
  const create = useMutation({ mutationFn: () => api('/research/projects', { method: 'POST', body: { cycle_id: cycle.id, title: newTitle.trim(), description: newDescription.trim() } }), onSuccess: () => { setNewTitle(''); setNewDescription(''); setNotice({ type: 'success', text: 'Project created successfully.' }); refresh(); }, onError: (error) => setNotice({ type: 'error', text: error.message }) });
  const update = useMutation({ mutationFn: ({ id, body }) => api(`/research/projects/${id}`, { method: 'PATCH', body }), onSuccess: () => { setEditingId(null); setNotice({ type: 'success', text: 'Project changes saved successfully.' }); refresh(); }, onError: (error) => setNotice({ type: 'error', text: error.message }) });
  const remove = useMutation({ mutationFn: (id) => api(`/research/projects/${id}`, { method: 'DELETE' }), onSuccess: () => { setNotice({ type: 'success', text: 'Project deleted successfully.' }); refresh(); }, onError: (error) => setNotice({ type: 'error', text: error.message }) });
  if (isLoading) return <div className="loading-state">Loading your research projects…</div>;
  const scrollToCreate = () => document.getElementById('add-research-project')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return <div className="max-w-3xl space-y-6"><PageHeader eyebrow="Research studio" title="Manage research projects" description="Create up to four research projects and manage each one from its project card." /><UnlockRequestPanel />
    {notice && <div role="status" className={`inline-notice ${notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>{notice.text}</div>}
    <Card id="add-research-project" className="p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold">Add a new research project</h2><p className="form-help">{cycle?.name ?? 'There is no open internship cycle right now.'}</p></div><Badge status={atLimit ? 'rejected' : 'pending'}>{own.length} / 4 projects</Badge></div>{atLimit ? <p className="mt-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">You have reached the maximum of four research projects. Delete an unused project before adding another.</p> : <div className="mt-5 space-y-4"><div><Label>Project title</Label><Input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="For example, Applied AI research" /></div><div><Label>Project description</Label><textarea value={newDescription} onChange={(event) => setNewDescription(event.target.value)} className="min-h-28 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Describe the problem, expected work, and learning outcomes." /></div><Button onClick={() => { setNotice(null); create.mutate(); }} disabled={create.isPending || !newTitle.trim() || !newDescription.trim() || !cycle}>{create.isPending ? 'Creating…' : 'Add project'}</Button>{cycleError && <p className="text-sm text-red-600">{cycleError.message}</p>}</div>}</Card>
    <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="section-title">My projects</h2><p className="mt-1 text-sm text-slate-600">Each card shows the project title, description, capacity, and available actions.</p></div><Button variant="secondary" onClick={scrollToCreate} disabled={atLimit}>+ Add project</Button></div>{projectsError && <p className="text-sm text-red-600">{projectsError.message}</p>}{own.length === 0 ? <EmptyState title="No projects listed yet" description="Use Add project to create your first research opportunity." /> : <div className="space-y-3">{own.map((project) => <ProjectCard key={project.id} project={project} editing={editingId === project.id} saving={update.isPending} deleting={remove.isPending} onEdit={() => { setNotice(null); setEditingId(project.id); }} onCancel={() => setEditingId(null)} onSave={(body) => update.mutate({ id: project.id, body })} onDelete={() => { if (window.confirm(`Delete “${project.title}”? Projects with student applications cannot be deleted.`)) { setNotice(null); remove.mutate(project.id); } }} />)}</div>}</section>
  </div>;
}
