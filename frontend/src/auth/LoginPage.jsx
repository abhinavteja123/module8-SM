import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { GraduationCap, IdentificationBadge, WarningCircle } from '@phosphor-icons/react';
import { useAuth } from './AuthContext.jsx';
import { api } from '../lib/api.js';
import { Button } from '../components/ui/button.jsx';
import { Input } from '../components/ui/input.jsx';

export default function LoginPage() {
  const { login, quickLogin } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [quickLoginInfo, setQuickLoginInfo] = useState({ accounts: [], university: 'SRM AP', cycle: '2023-2027' });
  // Explicit opt-in via VITE_ENABLE_QUICK_LOGINS (set on the deployment's own env vars,
  // same as local) — works in production builds too. The backend's own TEST_QUICK_LOGINS
  // gate is the real authority; this only controls whether the panel renders.
  const quickLoginsEnabled = import.meta.env.VITE_ENABLE_QUICK_LOGINS === 'true';

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
    <div className="relative grid min-h-screen overflow-hidden bg-paper lg:grid-cols-2">
      {/* Left — masthead, the one deliberate glass moment in the app */}
      <div className="relative flex items-center justify-center overflow-hidden bg-brand-900 px-6 py-14 lg:px-12">
        <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-brand-500/40 blur-3xl" />
        <div className="pointer-events-none absolute bottom-[-6rem] right-[-6rem] h-96 w-96 rounded-full bg-gold-500/30 blur-3xl" />
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
          className="glass-panel relative w-full max-w-md p-8 text-white sm:p-10"
        >
          <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/30">
            <GraduationCap size={28} weight="light" />
          </div>
          <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-gold-300">Internship &amp; Research</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Internship Portal</h1>
          <p className="mt-4 max-w-sm text-sm leading-6 text-white/70">
            Sign in with the account provided by your CRCS administrator. One system for research, opportunities,
            mentorship, and marks — built to last.
          </p>
        </motion.div>
      </div>

      {/* Right — form + demo quick logins */}
      <div className="flex items-center justify-center px-5 py-10 sm:px-10">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.32, 0.72, 0, 1] }}
          className="w-full max-w-md"
        >
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">Sign in</p>
          <h2 className="mt-1 text-xl font-bold text-ink">Welcome back</h2>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="login-email" className="mb-1.5 block text-sm font-semibold text-slate-700">Email address</label>
              <Input id="login-email" type="email" placeholder="you@university.edu" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="login-password" className="mb-1.5 block text-sm font-semibold text-slate-700">Password</label>
              <Input id="login-password" type="password" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                <WarningCircle size={16} weight="fill" className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          {quickLoginsEnabled && (
            <section className="mt-7 border-t border-slate-200 pt-5" aria-label="Local demo quick logins">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-brand-600">
                <IdentificationBadge size={14} weight="bold" /> Local demo quick logins
              </p>
              <p className="mt-1.5 text-xs leading-5 text-slate-500">
                {quickLoginInfo.university} · {quickLoginInfo.cycle} · 10 students, 10 faculty, and all oversight roles. Demo access only — restrict who can reach this deployment.
              </p>
              <div className="mt-3 max-h-80 space-y-4 overflow-y-auto pr-1">
                {quickGroups.map(({ group, accounts }) => (
                  <div key={group}>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{group}</p>
                    <div className="space-y-1.5">
                      {accounts.map((account, i) => (
                        <motion.button
                          key={account.email}
                          type="button"
                          disabled={busy}
                          onClick={() => signInQuickly(account)}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.25, delay: 0.15 + i * 0.03 }}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-left text-xs transition-all duration-150 hover:border-brand-300 hover:bg-brand-50/60 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <span className="block truncate font-semibold text-ink">{account.label} · {account.full_name}</span>
                          <span className="block truncate text-[11px] font-normal text-slate-500">{account.email}</span>
                        </motion.button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </motion.div>
      </div>
    </div>
  );
}
