import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Flask, Plus, LockSimple } from '@phosphor-icons/react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Card } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Label } from '../../components/ui/label.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { PageHeader, EmptyState } from '../../components/ui/page.jsx';
import { SkeletonCard } from '../../components/ui/skeleton.jsx';
import { useToast } from '../../components/ui/toast.jsx';
import UnlockRequestPanel from '../locks/UnlockRequestPanel.jsx';
import { useCycle } from '../../cycles/CycleContext.jsx';

function ProjectCard({ project, editing, onEdit, onCancel, onSave, onDelete, saving, deleting }) {
  const locked = project.status === 'locked' || project.status === 'full';
  const [title, setTitle] = useState(project.title);
  const [description, setDescription] = useState(project.description);
  return <Card className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-bold text-slate-950">{project.title}</h3><Badge status={project.status} /></div><p className="mt-1 text-sm text-slate-500">{project.approved_count} of {project.max_students} student places filled</p></div>{!editing && <div className="flex gap-2">{locked ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700"><LockSimple size={13} weight="light" />Locked after approval</span> : <Button variant="secondary" onClick={onEdit}>Edit</Button>}<Button variant="danger" onClick={onDelete} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete'}</Button></div>}</div>{editing ? <div className="mt-5 space-y-3 border-t border-slate-100 pt-4"><div><Label>Project title</Label><Input value={title} onChange={(event) => setTitle(event.target.value)} /></div><div><Label>Description</Label><textarea value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-28 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-ink shadow-sm shadow-slate-900/[0.03] outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100" /></div><div className="flex gap-2"><Button onClick={() => onSave({ title: title.trim(), description: description.trim() })} disabled={saving || !title.trim() || !description.trim()}>{saving ? 'Saving…' : 'Save changes'}</Button><Button variant="secondary" onClick={onCancel} disabled={saving}>Cancel</Button></div></div> : <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{project.description}</p>}</Card>;
}

export default function ProjectForm() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { selectedCycle: cycle, selectedCycleId } = useCycle();
  const { data: projects = [], isLoading, error: projectsError } = useQuery({ queryKey: ['research-projects', selectedCycleId], queryFn: () => api(`/research/projects?cycle_id=${selectedCycleId}`), enabled: !!selectedCycleId });
  const { data: settings } = useQuery({ queryKey: ['portal-settings'], queryFn: () => api('/admin/portal-settings') });
  const maxProjects = settings?.max_projects_per_faculty ?? 4;
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [editingId, setEditingId] = useState(null);
  const own = projects.filter((project) => project.faculty_id === user.id);
  const atLimit = own.length >= maxProjects;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['research-projects', selectedCycleId] });
  const create = useMutation({ mutationFn: () => api('/research/projects', { method: 'POST', body: { cycle_id: cycle.id, title: newTitle.trim(), description: newDescription.trim() } }), onSuccess: () => { setNewTitle(''); setNewDescription(''); toast.success('Project created successfully.'); refresh(); }, onError: (error) => toast.error(error.message) });
  const update = useMutation({ mutationFn: ({ id, body }) => api(`/research/projects/${id}`, { method: 'PATCH', body }), onSuccess: () => { setEditingId(null); toast.success('Project changes saved successfully.'); refresh(); }, onError: (error) => toast.error(error.message) });
  const remove = useMutation({ mutationFn: (id) => api(`/research/projects/${id}`, { method: 'DELETE' }), onSuccess: () => { toast.success('Project deleted successfully.'); refresh(); }, onError: (error) => toast.error(error.message) });
  const breadcrumb = [{ label: 'Home', to: '/faculty' }, { label: 'Research studio' }];
  if (isLoading) return <div className="max-w-3xl space-y-6"><PageHeader breadcrumb={breadcrumb} eyebrow="Research studio" title="Manage research projects" description={`Create up to ${maxProjects} research projects and manage each one from its project card.`} /><div className="grid gap-4 sm:grid-cols-2"><SkeletonCard /><SkeletonCard /></div></div>;
  const scrollToCreate = () => document.getElementById('add-research-project')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return <div className="max-w-3xl space-y-6"><PageHeader breadcrumb={breadcrumb} eyebrow="Research studio" title="Manage research projects" description={`Create up to ${maxProjects} research projects and manage each one from its project card.`} action={<span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-700"><Flask size={22} weight="light" /></span>} /><UnlockRequestPanel />
    <Card id="add-research-project" className="p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold">Add a new research project</h2><p className="form-help">{cycle?.name ?? 'There is no active internship cycle right now.'}</p></div><Badge status={atLimit ? 'rejected' : 'pending'}>{own.length} / {maxProjects} projects</Badge></div>{atLimit ? <p className="mt-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">You have reached the maximum of {maxProjects} research projects. Delete an unused project before adding another.</p> : <div className="mt-5 space-y-4"><div><Label>Project title</Label><Input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="For example, Applied AI research" /></div><div><Label>Project description</Label><textarea value={newDescription} onChange={(event) => setNewDescription(event.target.value)} className="min-h-28 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-ink shadow-sm shadow-slate-900/[0.03] outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100" placeholder="Describe the problem, expected work, and learning outcomes." /></div><Button onClick={() => create.mutate()} disabled={create.isPending || !newTitle.trim() || !newDescription.trim() || !cycle}>{create.isPending ? 'Creating…' : 'Add project'}</Button></div>}</Card>
    <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="section-title">My projects</h2><p className="mt-1 text-sm text-slate-600">Each card shows the project title, description, capacity, and available actions.</p></div><Button variant="secondary" onClick={scrollToCreate} disabled={atLimit}><Plus size={14} weight="bold" />Add project</Button></div>{projectsError && <p className="text-sm text-red-600">{projectsError.message}</p>}{own.length === 0 ? <EmptyState icon={Flask} title="No projects listed yet" description="Use Add project to create your first research opportunity." /> : <div className="space-y-3">{own.map((project, index) => <motion.div key={project.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: index * 0.04, ease: [0.32, 0.72, 0, 1] }}><ProjectCard project={project} editing={editingId === project.id} saving={update.isPending} deleting={remove.isPending} onEdit={() => setEditingId(project.id)} onCancel={() => setEditingId(null)} onSave={(body) => update.mutate({ id: project.id, body })} onDelete={() => { if (window.confirm(`Delete “${project.title}”? Projects with student applications cannot be deleted.`)) remove.mutate(project.id); }} /></motion.div>)}</div>}</section>
  </div>;
}
