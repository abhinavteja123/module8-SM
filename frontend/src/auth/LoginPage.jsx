import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import { api } from '../lib/api.js';
import { Button } from '../components/ui/button.jsx';
import { Input } from '../components/ui/input.jsx';
import { Card } from '../components/ui/card.jsx';

export default function LoginPage() {
  const { login, quickLogin } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [quickLoginInfo, setQuickLoginInfo] = useState({ accounts: [], university: 'SRM AP', cycle: '2023-2027' });
  const quickLoginsEnabled = import.meta.env.DEV && import.meta.env.VITE_ENABLE_QUICK_LOGINS === 'true';

  useEffect(() => {
    if (!quickLoginsEnabled) return undefined;
    let active = true;
    api('/auth/testing-accounts')
      .then((data) => { if (active) setQuickLoginInfo({ accounts: data.accounts ?? [], university: data.university ?? 'SRM AP', cycle: data.cycle ?? '2023-2027' }); })
      .catch(() => { if (active) setQuickLoginInfo((current) => ({ ...current, accounts: [] })); });
    return () => { active = false; };
  }, [quickLoginsEnabled]);

  async function signIn(loginEmail, loginPassword) {
    setError(null);
    setBusy(true);
    try {
      await login(loginEmail.trim().toLowerCase(), loginPassword);
      navigate('/');
    } catch (err) {
      let message = err?.message || 'Unable to sign in.';
      try {
        const parsed = JSON.parse(message);
        message = typeof parsed === 'string' ? parsed : (parsed?.error || message);
      } catch {
        // Keep the plain network/validation message.
      }
      setError(typeof message === 'string' ? message : 'Invalid email or password.');
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    signIn(email, password);
  }

  async function signInQuickly(account) {
    setError(null);
    setBusy(true);
    try {
      await quickLogin(account.email);
      navigate('/');
    } catch {
      setError('The local demo account is unavailable. Confirm the backend is running with TEST_QUICK_LOGINS=true.');
    } finally {
      setBusy(false);
    }
  }

  const quickGroups = ['Oversight & coordination', 'Faculty demo accounts', 'Student demo accounts']
    .map((group) => ({ group, accounts: quickLoginInfo.accounts.filter((account) => account.group === group) }))
    .filter((section) => section.accounts.length);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-indigo-800 to-violet-700 px-5 py-8 lg:grid lg:place-items-center">
      <div className="mx-auto w-full max-w-md">
      <Card className="p-8 shadow-2xl">
        <div className="mb-7"><span className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-indigo-600 font-bold text-white">IP</span><p className="text-sm font-semibold uppercase tracking-wider text-indigo-600">University workspace</p><h1 className="text-2xl font-bold">Internship Portal</h1><p className="mt-1 text-sm text-slate-500">Sign in with the account provided by your CRCS administrator.</p></div>
        <form onSubmit={onSubmit} className="space-y-3">
          <div><label htmlFor="login-email" className="mb-1 block text-sm font-medium text-slate-700">Email address</label><Input id="login-email" type="email" placeholder="you@university.edu" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          <div><label htmlFor="login-password" className="mb-1 block text-sm font-medium text-slate-700">Password</label><Input id="login-password" type="password" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
          {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        {quickLoginsEnabled && (
          <section className="mt-6 border-t border-slate-200 pt-5" aria-label="Local demo quick logins">
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Local demo quick logins</p>
            <p className="mt-1 text-xs text-slate-500">{quickLoginInfo.university} · {quickLoginInfo.cycle} · 10 students, 10 faculty, and all oversight roles. This panel is not included in production builds.</p>
            <div className="mt-3 max-h-80 space-y-4 overflow-y-auto pr-1">
              {quickGroups.map(({ group, accounts }) => <div key={group}><p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{group}</p><div className="space-y-2">
                {accounts.map((account) => (
                  <Button key={account.email} type="button" variant="outline" disabled={busy} className="h-auto min-h-12 w-full justify-start px-3 py-2 text-left text-xs" onClick={() => signInQuickly(account)}>
                    <span className="min-w-0"><span className="block font-semibold">{account.label} · {account.full_name}</span><span className="block truncate text-[11px] font-normal text-slate-500">{account.email}</span></span>
                  </Button>
                ))}
              </div></div>)}
            </div>
          </section>
        )}
      </Card>
      </div>
    </div>
  );
}
