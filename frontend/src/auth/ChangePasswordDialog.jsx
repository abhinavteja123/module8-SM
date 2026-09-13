import { useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from './AuthContext.jsx';
import { Button } from '../components/ui/button.jsx';
import { Card } from '../components/ui/card.jsx';
import { Input } from '../components/ui/input.jsx';
import { Label } from '../components/ui/label.jsx';

export default function ChangePasswordDialog({ required = false, onClose }) {
  const { setCurrentUser } = useAuth();
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const change = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setError(null);
    if (form.new_password !== form.confirm_password) {
      setError('New password and confirmation do not match.');
      return;
    }
    setSaving(true);
    try {
      const data = await api('/auth/change-password', { method: 'POST', body: { current_password: form.current_password, new_password: form.new_password } });
      setCurrentUser(data.user);
      onClose?.();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setSaving(false);
    }
  }

  return <div role="presentation" className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 p-4"><Card role="dialog" aria-modal="true" aria-label="Change password" className="w-full max-w-md border-indigo-200 bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Account security</p><h2 className="mt-1 text-xl font-bold text-slate-950">{required ? 'Change your temporary password' : 'Change password'}</h2><p className="mt-2 text-sm leading-5 text-slate-600">{required ? 'This is required before you can use the portal.' : 'Use your current password to set a new secure password.'}</p></div>{!required && <Button type="button" variant="ghost" className="px-3 py-2" onClick={onClose}>Close</Button>}</div><form className="mt-6 space-y-4" onSubmit={submit}><div><Label>Current password</Label><Input className="mt-2" type="password" value={form.current_password} onChange={change('current_password')} autoComplete="current-password" required /></div><div><Label>New password</Label><Input className="mt-2" type="password" value={form.new_password} onChange={change('new_password')} autoComplete="new-password" minLength={8} required /><p className="form-help">Use at least 8 characters and choose a password different from the temporary one.</p></div><div><Label>Confirm new password</Label><Input className="mt-2" type="password" value={form.confirm_password} onChange={change('confirm_password')} autoComplete="new-password" minLength={8} required /></div>{error && <p className="text-sm text-red-700">{error}</p>}<div className="flex justify-end gap-2">{!required && <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>}<Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Update password'}</Button></div></form></Card></div>;
}
