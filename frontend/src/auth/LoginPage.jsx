import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import { api } from '../lib/api.js';
import { Button } from '../components/ui/button.jsx';
import { Input } from '../components/ui/input.jsx';
import { Card } from '../components/ui/card.jsx';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const { data: quickTestAccounts = [], isLoading: loadingQuickAccounts } = useQuery({ queryKey: ['testing-quick-accounts'], queryFn: () => api('/auth/testing-accounts'), enabled: import.meta.env.DEV, retry: false, staleTime: Infinity });

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

  function quickSignIn(account) {
    setEmail(account.email);
    setPassword(account.password);
    signIn(account.email, account.password);
  }

  const quickGroups = quickTestAccounts.reduce((groups, account) => {
    (groups[account.group] ??= []).push(account);
    return groups;
  }, {});

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-indigo-800 to-violet-700 px-5 py-8 lg:grid lg:place-items-center">
      <div className={`mx-auto grid w-full items-start gap-6 ${quickTestAccounts.length > 0 || loadingQuickAccounts ? 'max-w-6xl lg:grid-cols-[minmax(360px,420px)_minmax(0,1fr)]' : 'max-w-md'}`}>
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
      </Card>
        {(quickTestAccounts.length > 0 || loadingQuickAccounts) && <Card className="p-6 shadow-2xl" aria-label="Testing quick sign-in">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-sm font-bold text-slate-900">Testing quick sign-in</h2><p className="mt-1 text-xs leading-5 text-slate-500">Local test accounts only. Each button signs in with the shown username as its password.</p></div><span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-800">Development only</span></div>
          <div className="mt-4 space-y-4">{loadingQuickAccounts ? <p className="text-xs text-slate-500">Loading local test accounts…</p> : Object.entries(quickGroups).map(([group, accounts]) => <div key={group}><p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{group}</p><div className="grid gap-2 sm:grid-cols-2">{accounts.map((account) => <button key={account.email} type="button" onClick={() => quickSignIn(account)} disabled={busy} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-left transition hover:border-indigo-300 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60"><span className="block truncate text-xs font-bold text-slate-900">{account.name}</span><span className="mt-0.5 block truncate text-[11px] text-slate-600">{account.role} · {account.email}</span><span className="mt-1 block truncate font-mono text-[10px] text-indigo-700">Password: {account.password}</span></button>)}</div></div>)}</div>
        </Card>}
      </div>
    </div>
  );
}
