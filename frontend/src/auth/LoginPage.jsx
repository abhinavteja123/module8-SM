import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import { Button } from '../components/ui/button.jsx';
import { Input } from '../components/ui/input.jsx';
import { Card } from '../components/ui/card.jsx';

const DEMO_PASSWORD = 'Passw0rd!';

const demoGroups = [
  {
    title: 'CRCS access',
    accounts: [
      ['CRCS Superadmin', 'crcs.admin@example.edu'],
      ['CRCS Coordinator', 'crcs.coordinator@example.edu'],
    ],
  },
  {
    title: 'Academic leadership',
    accounts: [
      ['Faculty Coordinator', 'coordinator@example.edu'],
      ['HOD — CSE', 'hod@example.edu'], ['HOD — ECE', 'ece.hod@example.edu'], ['HOD — Physics', 'physics.hod@example.edu'], ['HOD — MBA', 'mba.hod@example.edu'],
      ['Dean — Engineering', 'dean@example.edu'], ['Dean — Science', 'science.dean@example.edu'], ['Dean — Management', 'management.dean@example.edu'],
      ['School Office — Engineering', 'school.office@example.edu'], ['School Office — Science', 'science.office@example.edu'], ['School Office — Management', 'management.office@example.edu'],
    ],
  },
  {
    title: 'Faculty mentors',
    accounts: [
      ['Research Mentor — CSE', 'faculty@example.edu'], ['Research Mentor — ECE', 'ece.research@example.edu'], ['Research Mentor — Physics', 'physics.research@example.edu'],
      ['Direct Mentor — CSE', 'industry.mentor@example.edu'], ['Direct Mentor — ECE', 'ece.mentor@example.edu'], ['Direct Mentor — MBA', 'mba.mentor@example.edu'],
    ],
  },
  {
    title: 'Students',
    accounts: [
      ['Student — CSE', 'student@example.edu'], ['Student — ECE', 'ece.student@example.edu'], ['Student — Physics', 'physics.student@example.edu'], ['Student — MBA', 'mba.student@example.edu'],
      ['Student — Opportunity', 'arjun.cse@example.edu'], ['Student — Self-internship', 'nisha.cse@example.edu'],
    ],
  },
];

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

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

  function signInAsDemo(demoEmail) {
    setEmail(demoEmail);
    setPassword(DEMO_PASSWORD);
    signIn(demoEmail, DEMO_PASSWORD);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-indigo-800 to-violet-700 px-5 py-8">
      <div className="mx-auto grid w-full max-w-6xl items-start gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <Card className="p-8 shadow-2xl">
        <div className="mb-7"><span className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-indigo-600 font-bold text-white">IP</span><p className="text-sm font-semibold uppercase tracking-wider text-indigo-600">University workspace</p><h1 className="text-2xl font-bold">Internship Portal</h1><p className="mt-1 text-sm text-slate-500">Sign in to manage your internship journey.</p></div>
        <form onSubmit={onSubmit} className="space-y-3">
          <div><label htmlFor="login-email" className="mb-1 block text-sm font-medium text-slate-700">Email address</label><Input id="login-email" type="email" placeholder="you@university.edu" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          <div><label htmlFor="login-password" className="mb-1 block text-sm font-medium text-slate-700">Password</label><Input id="login-password" type="password" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
          {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <div className="mt-5 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500"><span className="font-semibold text-slate-700">Demo password:</span> {DEMO_PASSWORD}</div>
      </Card>
      <Card className="max-h-[82vh] overflow-y-auto p-6 shadow-2xl">
        <div><p className="text-sm font-semibold uppercase tracking-wider text-indigo-600">Verification access</p><h2 className="mt-1 text-xl font-bold">Sign in as a demo user</h2><p className="mt-1 text-sm text-slate-500">Choose any role below to open its workspace with the demo password.</p></div>
        <div className="mt-5 space-y-5">{demoGroups.map((group) => <section key={group.title}><h3 className="mb-2 text-sm font-bold text-slate-700">{group.title}</h3><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{group.accounts.map(([label, demoEmail]) => <Button key={demoEmail} type="button" variant="secondary" className="h-auto min-h-12 justify-start whitespace-normal px-3 py-2 text-left" onClick={() => signInAsDemo(demoEmail)} disabled={busy}><span><span className="block text-sm">{label}</span><span className="block text-xs font-normal text-slate-500">{demoEmail}</span></span></Button>)}</div></section>)}</div>
      </Card>
      </div>
    </div>
  );
}
