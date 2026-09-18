import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Card } from '../../components/ui/card.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Label } from '../../components/ui/label.jsx';
import { Button } from '../../components/ui/button.jsx';
import { PageHeader } from '../../components/ui/page.jsx';
import ChangePasswordDialog from '../../auth/ChangePasswordDialog.jsx';

const EMPTY_FORM = { university_name: '', university_code: '', admin_full_name: '', admin_email: '', admin_password: '' };
const EMPTY_EDIT_FORM = { university_name: '', university_code: '' };
const EMPTY_SUPERADMIN_FORM = { full_name: '', email: '' };
const EMPTY_PASSWORD_FORM = { password: '', confirm_password: '' };

export default function PlatformAdminPage() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const { data: universities = [], isLoading } = useQuery({ queryKey: ['platform-universities'], queryFn: () => api('/platform/universities') });
  const [form, setForm] = useState(EMPTY_FORM);
  const [status, setStatus] = useState(null);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [editingUniversityId, setEditingUniversityId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);
  const [editingSuperadminId, setEditingSuperadminId] = useState(null);
  const [superadminForm, setSuperadminForm] = useState(EMPTY_SUPERADMIN_FORM);
  const [passwordSuperadminId, setPasswordSuperadminId] = useState(null);
  const [temporaryPassword, setTemporaryPassword] = useState(EMPTY_PASSWORD_FORM);
  const change = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  const create = useMutation({
    mutationFn: () => api('/platform/universities', { method: 'POST', body: form }),
    onSuccess: (result) => { setStatus(`${result.university.name} created. Superadmin ${result.admin.email} can now sign in.`); setForm(EMPTY_FORM); queryClient.invalidateQueries({ queryKey: ['platform-universities'] }); },
    onError: (error) => setStatus(error.message),
  });
  const refreshUniversities = () => queryClient.invalidateQueries({ queryKey: ['platform-universities'] });
  const updateUniversity = useMutation({
    mutationFn: ({ id, body }) => api(`/platform/universities/${id}`, { method: 'PATCH', body }),
    onSuccess: (university) => { setStatus({ type: 'success', message: `${university.name} updated.` }); setEditingUniversityId(null); setEditForm(EMPTY_EDIT_FORM); refreshUniversities(); },
    onError: (error) => setStatus({ type: 'error', message: error.message }),
  });
  const setUniversityActive = useMutation({
    mutationFn: ({ id, is_active }) => api(`/platform/universities/${id}/active`, { method: 'PATCH', body: { is_active } }),
    onSuccess: (university) => { setStatus({ type: 'success', message: `${university.name} is now ${university.is_active ? 'active' : 'deactivated'}.` }); refreshUniversities(); },
    onError: (error) => setStatus({ type: 'error', message: error.message }),
  });
  const deleteUniversity = useMutation({
    mutationFn: (id) => api(`/platform/universities/${id}`, { method: 'DELETE' }),
    onSuccess: () => { setStatus({ type: 'success', message: 'University deleted.' }); refreshUniversities(); },
    onError: (error) => setStatus({ type: 'error', message: error.message }),
  });
  const updateSuperadmin = useMutation({
    mutationFn: ({ universityId, personId, body }) => api(`/platform/universities/${universityId}/superadmins/${personId}`, { method: 'PATCH', body }),
    onSuccess: (person) => { setStatus({ type: 'success', message: `${person.full_name}'s details updated.` }); setEditingSuperadminId(null); setSuperadminForm(EMPTY_SUPERADMIN_FORM); refreshUniversities(); },
    onError: (error) => setStatus({ type: 'error', message: error.message }),
  });
  const resetSuperadminPassword = useMutation({
    mutationFn: ({ universityId, personId, password }) => api(`/platform/universities/${universityId}/superadmins/${personId}/password`, { method: 'PATCH', body: { password } }),
    onSuccess: () => { setStatus({ type: 'success', message: 'Manual password override saved. The Superadmin must change it at their next sign-in.' }); setPasswordSuperadminId(null); setTemporaryPassword(EMPTY_PASSWORD_FORM); refreshUniversities(); },
    onError: (error) => setStatus({ type: 'error', message: error.message }),
  });
  const startEdit = (university) => {
    setStatus(null);
    setEditingUniversityId(university.id);
    setEditForm({ university_name: university.name, university_code: university.code });
  };
  const toggleActive = (university) => {
    const nextActive = university.is_active === false;
    const action = nextActive ? 'reactivate' : 'deactivate';
    if (window.confirm(`${action[0].toUpperCase()}${action.slice(1)} ${university.name}? ${nextActive ? 'Its existing accounts will be able to sign in again.' : 'All tenant accounts will be blocked, but no data will be deleted.'}`)) {
      setStatus(null);
      setUniversityActive.mutate({ id: university.id, is_active: nextActive });
    }
  };
  const removeUniversity = (university) => {
    if (university.is_active !== false) {
      setStatus({ type: 'error', message: 'Deactivate this university before deleting it.' });
      return;
    }
    if (window.confirm(`Delete ${university.name} from the Vextra list? Its accounts, schools, cycles, and history will be retained for recovery.`)) {
      setStatus(null);
      deleteUniversity.mutate(university.id);
    }
  };
  const startSuperadminEdit = (person) => {
    setStatus(null);
    setEditingSuperadminId(person.id);
    setSuperadminForm({ full_name: person.full_name, email: person.email });
    setPasswordSuperadminId(null);
  };
  const startPasswordReset = (person) => {
    setStatus(null);
    setPasswordSuperadminId(person.id);
    setTemporaryPassword(EMPTY_PASSWORD_FORM);
    setEditingSuperadminId(null);
  };
  const statusText = typeof status === 'string' ? status : status?.message;
  const statusClass = typeof status === 'string' ? (create.isError ? 'text-red-600' : 'text-emerald-700') : status?.type === 'error' ? 'text-red-600' : 'text-emerald-700';
  return <div className="mx-auto max-w-4xl space-y-6 p-6">
    <PageHeader eyebrow="Vextra" title="Universities" description="Add a university and its first CRCS Superadmin. That Superadmin then manages everything inside their own university." action={<div className="flex items-center gap-2"><Button variant="ghost" onClick={() => setPasswordDialogOpen(true)}>{user?.full_name ?? 'Account'}</Button><Button variant="secondary" onClick={logout}>Sign out</Button></div>} />
    <Card className="p-5">
      <h3 className="font-bold text-slate-950">Add a university</h3>
      <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); setStatus(null); create.mutate(); }}>
        <div><Label>University name</Label><Input value={form.university_name} onChange={change('university_name')} placeholder="SRM AP" required /></div>
        <div><Label>Short code</Label><Input value={form.university_code} onChange={(event) => setForm((current) => ({ ...current, university_code: event.target.value.toUpperCase() }))} placeholder="SRMAP" required /></div>
        <div><Label>Superadmin full name</Label><Input value={form.admin_full_name} onChange={change('admin_full_name')} required /></div>
        <div><Label>Superadmin email</Label><Input type="email" value={form.admin_email} onChange={change('admin_email')} required /></div>
        <div><Label>Temporary password</Label><Input type="password" value={form.admin_password} onChange={change('admin_password')} minLength={8} placeholder="At least 8 characters" required /></div>
        <div className="sm:col-span-2">{statusText && <p className={`mb-3 text-sm ${statusClass}`}>{statusText}</p>}<Button type="submit" disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Create university'}</Button></div>
      </form>
    </Card>
    <Card className="p-5">
      <div><h3 className="font-bold text-slate-950">Universities ({universities.length})</h3><p className="mt-1 text-sm text-slate-600">Edit tenant details, deactivate to pause access, then delete to archive it safely from this list.</p></div>
      {isLoading ? <p className="mt-3 text-sm text-slate-600">Loading…</p> : universities.length
        ? <ul className="mt-4 space-y-3">{universities.map((university) => {
          const isActive = university.is_active !== false;
          const isEditing = editingUniversityId === university.id;
          const busy = updateUniversity.isPending || setUniversityActive.isPending || deleteUniversity.isPending || updateSuperadmin.isPending || resetSuperadminPassword.isPending;
          return <li key={university.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><p className="font-medium text-slate-800">{university.name}</p><div className="mt-1 flex flex-wrap items-center gap-2"><span className="rounded bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-800">{university.code}</span><span className={`rounded px-2 py-0.5 text-xs font-semibold ${isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>{isActive ? 'Active' : 'Deactivated'}</span></div></div><div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => startEdit(university)} disabled={busy || isEditing}>Edit</Button><Button type="button" variant="ghost" className="px-3 py-1.5 text-xs text-amber-700" onClick={() => toggleActive(university)} disabled={busy}>{isActive ? 'Deactivate' : 'Reactivate'}</Button><Button type="button" variant="ghost" className="px-3 py-1.5 text-xs text-red-700" title={isActive ? 'Deactivate before deleting' : 'Archive this university'} onClick={() => removeUniversity(university)} disabled={busy || isActive}>Delete</Button></div></div>
            {isEditing && <form className="mt-4 grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-[1fr_180px_auto]" onSubmit={(event) => { event.preventDefault(); setStatus(null); updateUniversity.mutate({ id: university.id, body: editForm }); }}><div><Label htmlFor={`university-name-${university.id}`}>University name</Label><Input id={`university-name-${university.id}`} className="mt-1" value={editForm.university_name} onChange={(event) => setEditForm((current) => ({ ...current, university_name: event.target.value }))} required /></div><div><Label htmlFor={`university-code-${university.id}`}>Short code</Label><Input id={`university-code-${university.id}`} className="mt-1" value={editForm.university_code} onChange={(event) => setEditForm((current) => ({ ...current, university_code: event.target.value.toUpperCase() }))} required /></div><div className="flex items-end gap-2"><Button type="submit" className="px-3 py-2 text-xs" disabled={updateUniversity.isPending}>{updateUniversity.isPending ? 'Saving…' : 'Save'}</Button><Button type="button" variant="ghost" className="px-3 py-2 text-xs" onClick={() => { setEditingUniversityId(null); setEditForm(EMPTY_EDIT_FORM); }}>Cancel</Button></div></form>}
            <div className="mt-4 border-t border-slate-200 pt-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">CRCS Superadmin{university.superadmins?.length === 1 ? '' : 's'}</p>{university.superadmins?.length ? <div className="mt-2 space-y-2">{university.superadmins.map((person) => { const isEditingPerson = editingSuperadminId === person.id; const isResettingPassword = passwordSuperadminId === person.id; return <div key={person.id} className="rounded-md bg-white p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold text-slate-800">{person.full_name}</p><p className="text-xs text-slate-600">{person.email}</p><p className={`mt-1 text-xs font-medium ${person.must_change_password ? 'text-amber-700' : 'text-slate-500'}`}>{person.must_change_password ? 'Password change required' : person.is_active ? 'Account active' : 'Account inactive'}</p></div><div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => startSuperadminEdit(person)} disabled={busy || isEditingPerson}>Edit details</Button><Button type="button" variant="ghost" className="px-3 py-1.5 text-xs text-indigo-700" onClick={() => startPasswordReset(person)} disabled={busy || isResettingPassword}>Manual password override</Button></div></div>{isEditingPerson && <form className="mt-3 grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(event) => { event.preventDefault(); setStatus(null); updateSuperadmin.mutate({ universityId: university.id, personId: person.id, body: superadminForm }); }}><div><Label htmlFor={`superadmin-name-${person.id}`}>Full name</Label><Input id={`superadmin-name-${person.id}`} className="mt-1" value={superadminForm.full_name} onChange={(event) => setSuperadminForm((current) => ({ ...current, full_name: event.target.value }))} required /></div><div><Label htmlFor={`superadmin-email-${person.id}`}>Email address</Label><Input id={`superadmin-email-${person.id}`} className="mt-1" type="email" value={superadminForm.email} onChange={(event) => setSuperadminForm((current) => ({ ...current, email: event.target.value }))} required /></div><div className="flex items-end gap-2"><Button type="submit" className="px-3 py-2 text-xs" disabled={updateSuperadmin.isPending}>{updateSuperadmin.isPending ? 'Saving…' : 'Save'}</Button><Button type="button" variant="ghost" className="px-3 py-2 text-xs" onClick={() => { setEditingSuperadminId(null); setSuperadminForm(EMPTY_SUPERADMIN_FORM); }}>Cancel</Button></div></form>}{isResettingPassword && <form className="mt-3 grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(event) => { event.preventDefault(); if (temporaryPassword.password !== temporaryPassword.confirm_password) return setStatus({ type: 'error', message: 'Temporary passwords do not match.' }); setStatus(null); resetSuperadminPassword.mutate({ universityId: university.id, personId: person.id, password: temporaryPassword.password }); }}><div><Label htmlFor={`temporary-password-${person.id}`}>Override password</Label><Input id={`temporary-password-${person.id}`} className="mt-1" type="password" minLength={8} value={temporaryPassword.password} onChange={(event) => setTemporaryPassword((current) => ({ ...current, password: event.target.value }))} required /></div><div><Label htmlFor={`confirm-temporary-password-${person.id}`}>Confirm override password</Label><Input id={`confirm-temporary-password-${person.id}`} className="mt-1" type="password" minLength={8} value={temporaryPassword.confirm_password} onChange={(event) => setTemporaryPassword((current) => ({ ...current, confirm_password: event.target.value }))} required /></div><div className="flex items-end gap-2"><Button type="submit" className="px-3 py-2 text-xs" disabled={resetSuperadminPassword.isPending}>{resetSuperadminPassword.isPending ? 'Saving…' : 'Save override'}</Button><Button type="button" variant="ghost" className="px-3 py-2 text-xs" onClick={() => { setPasswordSuperadminId(null); setTemporaryPassword(EMPTY_PASSWORD_FORM); }}>Cancel</Button></div><p className="sm:col-span-3 text-xs text-amber-700">The Superadmin must choose a private password when they next sign in.</p></form>}</div>; })}</div> : <p className="mt-2 text-sm text-amber-700">No CRCS Superadmin is assigned to this university.</p>}</div>
          </li>;
        })}</ul>
        : <p className="mt-3 text-sm text-slate-500">No universities yet.</p>}
    </Card>
    {passwordDialogOpen && <ChangePasswordDialog onClose={() => setPasswordDialogOpen(false)} />}
  </div>;
}
