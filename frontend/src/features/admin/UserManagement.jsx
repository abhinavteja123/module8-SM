import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Button } from '../../components/ui/button.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Card } from '../../components/ui/card.jsx';
import { Select } from '../../components/ui/select.jsx';
import { Label } from '../../components/ui/label.jsx';

const ROLES = ['student', 'faculty', 'faculty_coordinator', 'hod', 'crcs_coordinator', 'crcs_superadmin', 'dean'];

export default function UserManagement() {
  const [form, setForm] = useState({ email: '', password: '', full_name: '', phone: '', role: 'student', department_id: '', school_id: '' });
  const [status, setStatus] = useState(null);

  const create = useMutation({
    mutationFn: () =>
      api('/admin/users', {
        method: 'POST',
        body: {
          email: form.email,
          password: form.password,
          full_name: form.full_name,
          phone: form.phone || undefined,
          roles: [{
            role: form.role,
            department_id: form.department_id || undefined,
            school_id: form.school_id || undefined,
          }],
        },
      }),
    onSuccess: () => setStatus('Account created.'),
    onError: (err) => setStatus(err.message),
  });

  const needsDept = ['student', 'faculty', 'faculty_coordinator', 'hod'].includes(form.role);
  const needsSchool = form.role === 'dean';

  return (
    <Card className="p-4 max-w-md">
      <h2 className="font-semibold mb-3">Create Account</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
        className="space-y-3"
      >
        <div>
          <Label>Email</Label>
          <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
        </div>
        <div>
          <Label>Password</Label>
          <Input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required minLength={8} />
        </div>
        <div>
          <Label>Full Name</Label>
          <Input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} required />
        </div>
        <div>
          <Label>Phone (optional)</Label>
          <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
        </div>
        <div>
          <Label>Role</Label>
          <Select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
        </div>
        {needsDept && (
          <div>
            <Label>Department ID</Label>
            <Input value={form.department_id} onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value }))} />
          </div>
        )}
        {needsSchool && (
          <div>
            <Label>School ID</Label>
            <Input value={form.school_id} onChange={(e) => setForm((f) => ({ ...f, school_id: e.target.value }))} />
          </div>
        )}
        {status && <p className="text-sm text-slate-600">{status}</p>}
        <Button type="submit" disabled={create.isPending}>Create</Button>
      </form>
    </Card>
  );
}
