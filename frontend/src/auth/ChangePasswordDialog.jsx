import { useState } from 'react';
import { ShieldCheck } from '@phosphor-icons/react';
import { api } from '../lib/api.js';
import { useAuth } from './AuthContext.jsx';
import { Button } from '../components/ui/button.jsx';
import { Input } from '../components/ui/input.jsx';
import { Label } from '../components/ui/label.jsx';
import { Dialog } from '../components/ui/dialog.jsx';

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

  return (
    <Dialog open onClose={required ? undefined : onClose} size="sm" title={
      <span className="flex items-center gap-2"><ShieldCheck size={20} weight="light" className="text-brand-600" />{required ? 'Change your temporary password' : 'Change password'}</span>
    }>
      <p className="-mt-2 mb-5 text-sm leading-5 text-slate-600">{required ? 'This is required before you can use the portal.' : 'Use your current password to set a new secure password.'}</p>
      <form className="space-y-4" onSubmit={submit}>
        <div><Label>Current password</Label><Input className="mt-2" type="password" value={form.current_password} onChange={change('current_password')} autoComplete="current-password" required /></div>
        <div><Label>New password</Label><Input className="mt-2" type="password" value={form.new_password} onChange={change('new_password')} autoComplete="new-password" minLength={8} required /><p className="form-help">Use at least 8 characters and choose a password different from the temporary one.</p></div>
        <div><Label>Confirm new password</Label><Input className="mt-2" type="password" value={form.confirm_password} onChange={change('confirm_password')} autoComplete="new-password" minLength={8} required /></div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          {!required && <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>}
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Update password'}</Button>
        </div>
      </form>
    </Dialog>
  );
}
