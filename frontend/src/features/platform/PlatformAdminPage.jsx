import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Card } from '../../components/ui/card.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Label } from '../../components/ui/label.jsx';
import { Button } from '../../components/ui/button.jsx';
import { PageHeader } from '../../components/ui/page.jsx';

const EMPTY_FORM = { university_name: '', university_code: '', admin_full_name: '', admin_email: '', admin_password: '' };

export default function PlatformAdminPage() {
  const { logout } = useAuth();
  const queryClient = useQueryClient();
  const { data: universities = [], isLoading } = useQuery({ queryKey: ['platform-universities'], queryFn: () => api('/platform/universities') });
  const [form, setForm] = useState(EMPTY_FORM);
  const [status, setStatus] = useState(null);
  const change = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  const create = useMutation({
    mutationFn: () => api('/platform/universities', { method: 'POST', body: form }),
    onSuccess: (result) => { setStatus(`${result.university.name} created. Superadmin ${result.admin.email} can now sign in.`); setForm(EMPTY_FORM); queryClient.invalidateQueries({ queryKey: ['platform-universities'] }); },
    onError: (error) => setStatus(error.message),
  });
  return <div className="mx-auto max-w-4xl space-y-6 p-6">
    <PageHeader eyebrow="Vextra" title="Universities" description="Add a university and its first CRCS Superadmin. That Superadmin then manages everything inside their own university." action={<Button variant="secondary" onClick={logout}>Sign out</Button>} />
    <Card className="p-5">
      <h3 className="font-bold text-slate-950">Add a university</h3>
      <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); setStatus(null); create.mutate(); }}>
        <div><Label>University name</Label><Input value={form.university_name} onChange={change('university_name')} placeholder="SRM AP" required /></div>
        <div><Label>Short code</Label><Input value={form.university_code} onChange={(event) => setForm((current) => ({ ...current, university_code: event.target.value.toUpperCase() }))} placeholder="SRMAP" required /></div>
        <div><Label>Superadmin full name</Label><Input value={form.admin_full_name} onChange={change('admin_full_name')} required /></div>
        <div><Label>Superadmin email</Label><Input type="email" value={form.admin_email} onChange={change('admin_email')} required /></div>
        <div><Label>Temporary password</Label><Input type="password" value={form.admin_password} onChange={change('admin_password')} minLength={8} placeholder="At least 8 characters" required /></div>
        <div className="sm:col-span-2">{status && <p className={`mb-3 text-sm ${create.isError ? 'text-red-600' : 'text-emerald-700'}`}>{status}</p>}<Button type="submit" disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Create university'}</Button></div>
      </form>
    </Card>
    <Card className="p-5">
      <h3 className="font-bold text-slate-950">Universities ({universities.length})</h3>
      {isLoading ? <p className="mt-3 text-sm text-slate-600">Loading…</p> : universities.length
        ? <ul className="mt-3 space-y-2">{universities.map((university) => <li key={university.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm"><span className="font-medium text-slate-800">{university.name}</span><span className="rounded bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-800">{university.code}</span></li>)}</ul>
        : <p className="mt-3 text-sm text-slate-500">No universities yet.</p>}
    </Card>
  </div>;
}
