import { Link } from 'react-router-dom';

export function PageHeader({ eyebrow, title, description, action }) {
  return (
    <div className="mb-8 flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">{eyebrow}</p>}
        <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, tone = 'indigo' }) {
  const tones = { indigo: 'bg-indigo-50 text-indigo-700', emerald: 'bg-emerald-50 text-emerald-700', amber: 'bg-amber-50 text-amber-700', slate: 'bg-slate-100 text-slate-700' };
  return <div className="portal-card p-5"><div className={`mb-4 h-2 w-10 rounded-full ${tones[tone]}`} /><p className="text-sm font-medium text-slate-600">{label}</p><p className="mt-1 text-3xl font-bold tracking-tight text-slate-950">{value ?? 0}</p>{hint && <p className="mt-2 text-xs text-slate-500">{hint}</p>}</div>;
}

export function EmptyState({ title, description, action, to }) {
  const content = action && to ? <Link to={to} className="inline-flex rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">{action}</Link> : action;
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center"><h2 className="font-semibold text-slate-900">{title}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">{description}</p>{content && <div className="mt-5">{content}</div>}</div>;
}
