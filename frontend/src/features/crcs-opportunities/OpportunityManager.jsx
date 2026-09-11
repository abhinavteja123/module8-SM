import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Card } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Label } from '../../components/ui/label.jsx';
import { Select } from '../../components/ui/select.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { hasRole } from '../../lib/permissions.js';
import { useCycle } from '../../cycles/CycleContext.jsx';

const empty = { title: '', organization_name: '', description: '', eligibility: '', eligible_department_ids: [], minimum_cgpa: '', application_deadline: '', application_url: '', opportunity_type: 'exclusive', accepting_applications: true };

function answerLabel(key) {
  if (key === 'response') return 'Application response';
  return key.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function applicationAnswerEntries(answers) {
  if (!answers) return [];
  let value = answers;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return [{ label: 'Application response', value }]; }
  }
  if (typeof value !== 'object' || Array.isArray(value)) return [{ label: 'Application response', value: String(value) }];
  return Object.entries(value)
    .filter(([, answer]) => answer !== null && answer !== undefined && String(answer).trim())
    .map(([key, answer]) => ({ label: answerLabel(key), value: typeof answer === 'string' ? answer : JSON.stringify(answer, null, 2) }));
}

function applicationAnswerText(answers) {
  return applicationAnswerEntries(answers).map(({ label, value }) => `${label}: ${value}`).join('\n');
}

function DepartmentEligibilityPicker({ departments, selectedIds, onChange }) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const filtered = departments.filter((department) => `${department.name} ${department.code}`.toLowerCase().includes(search.trim().toLowerCase()));
  const selected = new Set(selectedIds);
  const selectedDepartments = departments.filter((department) => selected.has(department.id));
  const summary = !selectedDepartments.length ? 'All departments' : selectedDepartments.length === 1 ? `${selectedDepartments[0].name} (${selectedDepartments[0].code})` : `${selectedDepartments.length} departments selected`;
  const toggle = (id) => onChange(selected.has(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id]);
  return <div className="relative"><div className="flex flex-wrap items-end justify-between gap-2"><Label>Eligible departments <span className="font-normal text-slate-400">(optional)</span></Label><div className="flex gap-3 text-xs font-bold text-indigo-700"><button type="button" onClick={() => { onChange(departments.map((department) => department.id)); setOpen(true); }}>Select all</button><button type="button" onClick={() => { onChange([]); setOpen(false); }}>Clear</button></div></div><button type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)} className="mt-2 flex w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-left text-sm shadow-sm hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"><span className={selectedDepartments.length ? 'text-slate-800' : 'text-slate-500'}>{summary}</span><span className="text-indigo-700">{open ? '▲' : '▼'}</span></button>{open && <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white p-3 shadow-lg"><Input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search existing department names or codes" /><div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2">{filtered.length ? filtered.map((department) => <label key={department.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-white"><input type="checkbox" checked={selected.has(department.id)} onChange={() => toggle(department.id)} /><span>{department.name} <span className="text-slate-500">({department.code})</span></span></label>) : <p className="p-2 text-sm text-slate-500">No existing departments match.</p>}</div><div className="mt-3 flex justify-end"><Button type="button" variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => setOpen(false)}>Done</Button></div></div>}<p className="form-help">Leave empty to allow every department. Choose one, several, or all departments.</p></div>;
}

function downloadCsv(rows, opportunity) {
  const headers = ['Student', 'Email', 'Phone', 'Roll number', 'Batch year', 'CGPA', 'Category', 'Department', 'School', 'Status', 'Offer details', 'Offer letter', 'Answers', 'Resume file'];
  const data = rows.map((row) => [row.student?.full_name, row.student?.email, row.student?.phone, row.student?.roll_number, row.student?.batch_year, row.student?.cgpa, row.student?.category, row.student?.department?.name, row.student?.department?.school?.name, row.status, row.external_offer_details?.details ?? '', row.documents?.find((document) => document.id === row.offer_letter_doc_id)?.file_name ?? '', applicationAnswerText(row.application_answers), row.resume?.file_name ?? '']);
  const csv = [headers, ...data].map((line) => line.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${opportunity.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-applications.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function ApplicantDetails({ application }) {
  const student = application.student ?? {};
  return <>
    <div className="mt-3 grid gap-x-6 gap-y-1 rounded-lg bg-slate-50 p-3 text-sm text-slate-600 sm:grid-cols-2">
      <p><span className="font-semibold text-slate-800">Phone:</span> {student.phone ?? '—'}</p>
      <p><span className="font-semibold text-slate-800">Roll number:</span> {student.roll_number ?? '—'}</p>
      <p><span className="font-semibold text-slate-800">Department:</span> {student.department?.name ?? '—'}</p>
      <p><span className="font-semibold text-slate-800">School:</span> {student.department?.school?.name ?? '—'}</p>
      <p><span className="font-semibold text-slate-800">Batch:</span> {student.batch_year ?? '—'}</p>
      <p><span className="font-semibold text-slate-800">CGPA:</span> {student.cgpa ?? '—'}</p>
    </div>
    {applicationAnswerEntries(application.application_answers).length > 0 && <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-sm"><p className="mb-2 font-semibold text-indigo-950">Application response</p><div className="space-y-3">{applicationAnswerEntries(application.application_answers).map((answer) => <div key={answer.label}><p className="text-xs font-bold uppercase tracking-wide text-indigo-700">{answer.label}</p><p className="mt-1 whitespace-pre-wrap text-indigo-950">{answer.value}</p></div>)}</div></div>}
    {application.external_offer_details?.details && <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-sm"><p className="mb-1 font-semibold text-indigo-950">External company selection details</p><p className="whitespace-pre-wrap text-indigo-900">{application.external_offer_details.details}</p></div>}
    <div className="mt-3 flex flex-wrap gap-3 text-sm">{application.resume?.url && <a className="font-semibold text-indigo-700 underline" href={application.resume.url} target="_blank" rel="noreferrer">Download resume</a>}{application.documents?.filter((document) => document.id !== application.resume?.id).map((document) => <a key={document.id} className="text-indigo-700 underline" href={document.url} target="_blank" rel="noreferrer">{document.file_name}</a>)}</div>
  </>;
}

function ApplicationDecision({ application, selectedApplication, setSelectedApplication, statusForm, setStatusForm, decide }) {
  if (application.status === 'crcs_approved') return <p className="mt-4 text-sm font-medium text-emerald-700">CRCS approval is final. Use mentor allocation below to manage the internship.</p>;
  const selected = selectedApplication === application.id;
  const rejecting = selected && statusForm.status === 'rejected';
  return <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(180px,0.7fr)_minmax(230px,1fr)_auto]">
    <Select value={selected ? statusForm.status : ''} onChange={(event) => { setSelectedApplication(application.id); setStatusForm({ status: event.target.value, reason: '' }); }}>
      <option value="">Change decision</option>
      <option value="under_review">Mark under review</option>
      <option value="offered">Mark as offered</option>
      <option value="crcs_approved">Approve</option>
      <option value="rejected">Reject</option>
    </Select>
    {rejecting ? <Input aria-label="Rejection reason" placeholder="Rejection reason (required)" value={statusForm.reason} onChange={(event) => setStatusForm((current) => ({ ...current, reason: event.target.value }))} required /> : <div className="hidden sm:block" />}
    {selected && <Button onClick={() => decide.mutate()} disabled={decide.isPending || !statusForm.status || (rejecting && !statusForm.reason.trim())}>{decide.isPending ? 'Saving…' : 'Save'}</Button>}
    {rejecting && <p className="text-sm text-slate-600 sm:col-span-3">A rejection reason is mandatory and will be shown to the student.</p>}
  </div>;
}

function MentorAllocation({ application, mentors }) {
  const queryClient = useQueryClient();
  const [mentorId, setMentorId] = useState(application.assigned_mentor_id ?? '');
  const allocate = useMutation({
    mutationFn: () => api(`/opportunities/applications/${application.id}/mentor`, { method: 'PATCH', body: { mentor_id: mentorId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['opportunity-applications'] }),
  });
  if (application.status !== 'crcs_approved') return null;
  return <div className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50 p-3"><p className="text-sm font-semibold text-indigo-950">Faculty mentor allocation</p><p className="mt-1 text-xs text-indigo-800">{application.mentor ? `Current mentor: ${application.mentor.full_name}.` : 'The student is waiting for a faculty mentor allocation.'}</p><div className="mt-2 flex flex-col gap-2 sm:flex-row"><Select value={mentorId} onChange={(event) => setMentorId(event.target.value)}><option value="">Choose faculty mentor</option>{mentors.map((mentor) => <option key={mentor.id} value={mentor.id}>{mentor.full_name} — {mentor.email}</option>)}</Select><Button onClick={() => allocate.mutate()} disabled={!mentorId || mentorId === application.assigned_mentor_id || allocate.isPending}>{allocate.isPending ? 'Allocating…' : application.mentor ? 'Change mentor' : 'Allocate mentor'}</Button></div>{allocate.isError && <p className="mt-2 text-sm text-red-700">{allocate.error.message}</p>}</div>;
}

function BulkDecisionPanel({ applications, opportunityId }) {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState([]);
  const [status, setStatus] = useState('');
  const [reason, setReason] = useState('');
  const update = useMutation({
    mutationFn: () => api('/opportunities/applications/bulk-status', { method: 'PATCH', body: { application_ids: selectedIds, status, reason: status === 'rejected' ? reason : undefined } }),
    onSuccess: () => { setSelectedIds([]); setStatus(''); setReason(''); queryClient.invalidateQueries({ queryKey: ['opportunity-applications'] }); },
  });
  const importList = useMutation({ mutationFn: (file) => { const body = new FormData(); body.append('file', file); body.append('opportunity_id', opportunityId); return api('/opportunities/applications/bulk-import', { method: 'POST', body, isFormData: true }); }, onSuccess: (data) => setSelectedIds(data.application_ids) });
  const actionableApplications = applications.filter((application) => application.status !== 'crcs_approved');
  if (!actionableApplications.length) return null;
  return <div className="border-b border-slate-200 bg-indigo-50 p-4"><p className="text-sm font-bold text-indigo-950">Bulk decision</p><p className="mt-1 text-xs text-indigo-800">Select multiple applicants manually, or upload an Excel/CSV file with an <code>email</code>, <code>roll_number</code>, or <code>application_id</code> column.</p><input className="mt-3 block text-sm" type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { const file = event.target.files?.[0]; if (file) importList.mutate(file); }} />{importList.isPending && <p className="mt-1 text-xs text-indigo-700">Matching uploaded applicants…</p>}{importList.isSuccess && <p className="mt-1 text-xs text-emerald-700">{importList.data.matched} applicant(s) selected from {importList.data.imported_rows} row(s).</p>}<div className="mt-3 grid gap-2 sm:grid-cols-[minmax(220px,1fr)_minmax(160px,0.6fr)_auto]"><select multiple value={selectedIds} onChange={(event) => setSelectedIds([...event.target.selectedOptions].map((option) => option.value))} className="min-h-20 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm">{actionableApplications.map((application) => <option key={application.id} value={application.id}>{application.student?.full_name ?? application.student?.email ?? 'Student'} — {application.status.replaceAll('_', ' ')}</option>)}</select><Select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Choose decision</option><option value="under_review">Mark under review</option><option value="offered">Mark as offered</option><option value="crcs_approved">Approve selected</option><option value="rejected">Reject selected</option></Select><Button onClick={() => update.mutate()} disabled={!selectedIds.length || !status || update.isPending || (status === 'rejected' && !reason.trim())}>{update.isPending ? 'Saving…' : `Apply to ${selectedIds.length || ''} selected`}</Button></div>{status === 'rejected' && <Input className="mt-2" placeholder="Rejection reason (required for all selected students)" value={reason} onChange={(event) => setReason(event.target.value)} />}{(update.isError || importList.isError) && <p className="mt-2 text-sm text-red-700">{update.error?.message ?? importList.error?.message}</p>}</div>;
}

function OpportunityRow({ item, applications, mentors, expanded, onToggle, onEdit, onDelete, onToggleApplications, ...decisionProps }) {
  const availability = item.application_status ?? (item.accepting_applications === false ? 'closed' : 'open');
  const availabilityLabel = availability === 'expired' ? 'Deadline passed' : availability === 'closed' ? 'Applications closed' : 'Accepting applications';
  return <Card className={`overflow-hidden transition ${expanded ? 'border-indigo-300 ring-1 ring-indigo-200' : ''}`}>
    {expanded && <BulkDecisionPanel applications={applications} opportunityId={item.id} />}
    <div role="button" tabIndex={0} onClick={onToggle} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onToggle(); }} className="grid cursor-pointer gap-3 p-5 hover:bg-slate-50 md:grid-cols-[minmax(220px,1.4fr)_minmax(150px,0.8fr)_minmax(130px,0.6fr)_auto] md:items-center">
      <div><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-slate-950">{item.title}</h3><Badge status={item.opportunity_type === 'open_source' ? 'pending' : 'approved'}>{item.opportunity_type === 'open_source' ? 'Open-source' : 'Exclusive CRCS'}</Badge><Badge status={availability === 'open' ? 'approved' : availability === 'closed' ? 'rejected' : 'revoked'}>{availabilityLabel}</Badge></div><p className="mt-1 text-sm text-indigo-700">{item.organization_name}</p><p className="mt-2 line-clamp-1 text-sm text-slate-600">{item.description || 'No description provided.'}</p></div>
      <div className="text-sm text-slate-600"><p><span className="font-semibold text-slate-800">{applications.length}</span> applicant{applications.length === 1 ? '' : 's'}</p>{item.minimum_cgpa != null && <p className="mt-1">Minimum CGPA: {item.minimum_cgpa}</p>}</div>
      <div className="text-sm text-slate-600">{item.application_deadline ? <>Deadline<br /><span className="font-semibold text-slate-800">{new Date(item.application_deadline).toLocaleDateString()}</span></> : 'No deadline set'}</div>
      <div className="flex flex-wrap items-center gap-2"><Button variant="secondary" onClick={(event) => { event.stopPropagation(); onEdit(); }}>Edit</Button>{availability === 'expired' ? <span className="text-xs font-medium text-slate-500">Edit deadline to reopen</span> : <Button variant="secondary" onClick={(event) => { event.stopPropagation(); onToggleApplications(); }}>{availability === 'closed' ? 'Reopen applications' : 'Close applications'}</Button>}<Button variant="danger" onClick={(event) => { event.stopPropagation(); onDelete(); }}>Delete</Button><span className="ml-1 text-sm font-semibold text-indigo-700">{expanded ? 'Hide ▲' : 'View ▼'}</span></div>
    </div>
    {expanded && <div className="border-t border-slate-200 bg-slate-50 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="font-bold">Applicants ({applications.length})</h4><p className="mt-1 text-sm text-slate-600">Review applications and update each student’s decision.</p></div><div className="flex gap-2">{item.application_url && <a href={item.application_url} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-indigo-700 shadow-sm ring-1 ring-slate-200">Open application link ↗</a>}<Button variant="secondary" onClick={() => downloadCsv(applications, item)}>Download CSV</Button></div></div>{!applications.length ? <p className="mt-5 rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">No active applications to review.</p> : <div className="mt-4 space-y-3">{applications.map((application) => <article key={application.id} className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{application.student?.full_name ?? 'Student'}</p><p className="text-sm text-slate-500">{application.student?.email}</p></div><Badge status={application.status} /></div><ApplicantDetails application={application} /><ApplicationDecision application={application} {...decisionProps} /><MentorAllocation application={application} mentors={mentors} /></article>)}</div>}</div>}
  </Card>;
}

export default function OpportunityManager() {
  const { selectedCycle: cycle } = useCycle();
  const { user } = useAuth();
  const isSuperadmin = hasRole(user, 'crcs_superadmin');
  const queryClient = useQueryClient();
  const [form, setForm] = useState(empty);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [selectedApplication, setSelectedApplication] = useState('');
  const [statusForm, setStatusForm] = useState({ status: '', reason: '' });
  const [typeFilter, setTypeFilter] = useState('');
  const [applicationFilter, setApplicationFilter] = useState('');
  const { data: permissionData } = useQuery({ queryKey: ['crcs-my-permissions'], queryFn: () => api('/admin/crcs-coordinator-permissions/me'), enabled: !isSuperadmin && hasRole(user, 'crcs_coordinator'), retry: false });
  const canManage = isSuperadmin || !!permissionData?.permissions?.view_opportunities;
  const { data: opportunities = [], isLoading, error } = useQuery({ queryKey: ['opportunities', cycle?.id], queryFn: () => api(`/opportunities?cycle_id=${cycle.id}`), enabled: !!cycle?.id });
  const { data: applications = [] } = useQuery({ queryKey: ['opportunity-applications', cycle?.id], queryFn: () => api(`/opportunities/applications?cycle_id=${cycle.id}`), enabled: !!cycle?.id });
  const { data: mentors = [] } = useQuery({ queryKey: ['opportunity-mentor-options'], queryFn: () => api('/opportunities/mentor-options'), enabled: canManage });
  const { data: departments = [] } = useQuery({ queryKey: ['departments'], queryFn: () => api('/departments'), enabled: canManage });
  const save = useMutation({ mutationFn: (body) => { const normalized = { ...body, minimum_cgpa: body.minimum_cgpa === '' ? undefined : Number(body.minimum_cgpa) }; return editingId ? api(`/opportunities/${editingId}`, { method: 'PATCH', body: normalized }) : api('/opportunities', { method: 'POST', body: { ...normalized, cycle_id: cycle.id } }); }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['opportunities'] }); setForm(empty); setEditingId(null); setFormOpen(false); } });
  const remove = useMutation({ mutationFn: (id) => api(`/opportunities/${id}`, { method: 'DELETE' }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['opportunities'] }); setExpandedId(null); } });
  const toggleApplications = useMutation({ mutationFn: (item) => api(`/opportunities/${item.id}`, { method: 'PATCH', body: { accepting_applications: item.application_status === 'closed' } }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['opportunities'] }) });
  const decide = useMutation({ mutationFn: () => api(`/opportunities/applications/${selectedApplication}/status`, { method: 'PATCH', body: statusForm }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['opportunity-applications'] }); setSelectedApplication(''); setStatusForm({ status: '', reason: '' }); }, onError: (error) => window.alert(`Could not save the decision: ${error.message}`) });
  const field = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const edit = (item) => { setEditingId(item.id); setFormOpen(true); setForm({ title: item.title, organization_name: item.organization_name, description: item.description ?? '', eligibility: item.eligibility ?? '', eligible_department_ids: item.eligible_department_ids ?? [], minimum_cgpa: item.minimum_cgpa ?? '', application_deadline: item.application_deadline?.slice(0, 10) ?? '', application_url: item.application_url ?? '', opportunity_type: item.opportunity_type ?? 'exclusive', accepting_applications: item.accepting_applications !== false }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  if (!isSuperadmin && hasRole(user, 'crcs_coordinator') && permissionData && !canManage) return <Card className="p-6"><h1 className="text-xl font-bold">Opportunities</h1><p className="mt-2 text-sm text-slate-600">Your CRCS Coordinator account has not been granted opportunity access by the Superadmin.</p></Card>;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">CRCS workspace</p><h1 className="text-3xl font-bold">Opportunities</h1><p className="text-sm text-slate-500">{cycle?.name ?? 'No open internship cycle'} · publish, review, and track applicants.</p></div>
        {isSuperadmin && <Button onClick={() => { setEditingId(null); setForm(empty); setFormOpen(true); }}>Post new opportunity</Button>}
      </div>
      {isSuperadmin && formOpen && <Card className="p-5">
        <div className="mb-4 flex items-start justify-between"><div><h2 className="text-lg font-semibold">{editingId ? 'Edit opportunity' : 'Post new opportunity'}</h2><p className="text-sm text-slate-500">Exclusive roles are campus opportunities; open-source roles link students to an external company application.</p></div><Button variant="ghost" onClick={() => { setEditingId(null); setForm(empty); setFormOpen(false); }}>Close</Button></div>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); save.mutate(form); }}>
          <div><Label>Title</Label><Input value={form.title} onChange={field('title')} placeholder="Applied AI Research Intern" required /></div>
          <div><Label>Organization</Label><Input value={form.organization_name} onChange={field('organization_name')} placeholder="Innovation Lab" required /></div>
          <div><Label>Opportunity type</Label><Select value={form.opportunity_type} onChange={field('opportunity_type')}><option value="exclusive">Exclusive CRCS — campus opportunity</option><option value="open_source">Open-source — external company application</option></Select><p className="form-help">Open-source students apply at the company, then upload their offer letter here for CRCS approval.</p></div>
          <div><Label>Application deadline</Label><Input type="date" value={form.application_deadline} onChange={field('application_deadline')} /></div>
          <div><Label>Application link <span className="font-normal text-slate-400">{form.opportunity_type === 'open_source' ? '(required)' : '(optional)'}</span></Label><Input type="url" value={form.application_url} onChange={field('application_url')} placeholder="https://company.example/apply" required={form.opportunity_type === 'open_source'} /></div>
          <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm md:col-span-2"><input type="checkbox" checked={form.accepting_applications} onChange={(event) => setForm((current) => ({ ...current, accepting_applications: event.target.checked }))} /><span><span className="font-semibold text-slate-900">Accepting applications</span><span className="mt-1 block text-xs text-slate-500">Turn this off to close applications manually. A passed deadline closes applications automatically; edit it to a future date to reopen.</span></span></label>
          <div className="md:col-span-2"><Label>Description</Label><textarea value={form.description} onChange={field('description')} className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Describe the work, team, and outcomes." /></div>
          <div><Label>Minimum CGPA <span className="font-normal text-slate-400">(optional)</span></Label><Input type="number" min="0" max="10" step="0.01" value={form.minimum_cgpa} onChange={field('minimum_cgpa')} placeholder="For example, 7.00" /><p className="form-help">Students below this CGPA should not apply.</p></div>
          <DepartmentEligibilityPicker departments={departments} selectedIds={form.eligible_department_ids} onChange={(eligible_department_ids) => setForm((current) => ({ ...current, eligible_department_ids }))} />
          <Button type="submit" disabled={save.isPending || !cycle} className="md:col-span-2">{save.isPending ? 'Saving…' : editingId ? 'Save changes' : 'Post opportunity'}</Button>
          {save.isError && <p className="text-sm text-red-600 md:col-span-2">{save.error.message}</p>}
        </form>
      </Card>}
      <section><div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold">Posted opportunities</h2><p className="text-sm text-slate-500">Filter campus and external roles, then open a row to review applicants.</p></div><span className="text-sm text-slate-500">{opportunities.filter((item) => item.application_status === 'open').length} accepting applications</span></div><div className="mb-4 grid gap-3 sm:grid-cols-2"><Select aria-label="Filter opportunity type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="">All opportunity types</option><option value="exclusive">Exclusive CRCS</option><option value="open_source">Open-source</option></Select><Select aria-label="Filter applicant status" value={applicationFilter} onChange={(event) => setApplicationFilter(event.target.value)}><option value="">All applicant statuses</option><option value="applied">Applied</option><option value="under_review">Under review</option><option value="offered">Offer letter submitted</option><option value="crcs_approved">CRCS approved</option><option value="rejected">Rejected</option></Select></div>{isLoading && <p>Loading opportunities…</p>}{error && <p className="text-sm text-red-600">{error.message}</p>}<div className="space-y-3">{opportunities.filter((item) => !typeFilter || (item.opportunity_type ?? 'exclusive') === typeFilter).map((item) => <OpportunityRow key={item.id} item={item} applications={applications.filter((application) => application.opportunity_id === item.id && (!applicationFilter || application.status === applicationFilter))} mentors={mentors} expanded={expandedId === item.id} onToggle={() => { setExpandedId((current) => current === item.id ? null : item.id); setSelectedApplication(''); setStatusForm({ status: '', reason: '' }); }} onEdit={() => edit(item)} onDelete={() => { if (window.confirm('Archive this opportunity? Existing applications will be retained.')) remove.mutate(item.id); }} onToggleApplications={() => toggleApplications.mutate(item)} selectedApplication={selectedApplication} setSelectedApplication={setSelectedApplication} statusForm={statusForm} setStatusForm={setStatusForm} decide={decide} />)}</div>{toggleApplications.isError && <p className="mt-3 text-sm text-red-600">{toggleApplications.error.message}</p>}</section>
    </div>
  );
}
