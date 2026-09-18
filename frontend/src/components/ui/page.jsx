import { Link } from 'react-router-dom';
import { TrendUp, TrendDown, Tray } from '@phosphor-icons/react';

export function Breadcrumb({ items = [] }) {
  if (!items.length) return null;
  return (
    <nav className="mb-3 flex items-center gap-1.5 text-xs font-medium text-slate-500">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-slate-300">/</span>}
          {item.to ? (
            <Link to={item.to} className="transition-colors hover:text-brand-600">{item.label}</Link>
          ) : (
            <span className={i === items.length - 1 ? 'text-ink' : ''}>{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function PageHeader({ eyebrow, title, description, action, breadcrumb, lastUpdated }) {
  return (
    <div className="mb-8 flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {breadcrumb && <Breadcrumb items={breadcrumb} />}
        {eyebrow && <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-brand-600">{eyebrow}</p>}
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{description}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        {lastUpdated && <p className="text-xs text-slate-400">Last updated {lastUpdated}</p>}
        {action && <div>{action}</div>}
      </div>
    </div>
  );
}

export function StatCard({ label, value, hint, tone = 'brand', icon: Icon, trend }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-700',
    gold: 'bg-gold-50 text-gold-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
    slate: 'bg-slate-100 text-slate-700',
    indigo: 'bg-brand-50 text-brand-700',
  };
  const TrendIcon = trend?.direction === 'down' ? TrendDown : TrendUp;
  const trendColor = trend?.direction === 'down' ? 'text-red-600' : 'text-emerald-600';
  return (
    <div className="portal-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${tones[tone] ?? tones.brand}`}>
          {Icon ? <Icon size={18} weight="bold" /> : <div className="h-2 w-2 rounded-full bg-current" />}
        </div>
        {trend && (
          <span className={`inline-flex items-center gap-1 text-xs font-semibold ${trendColor}`}>
            <TrendIcon size={13} weight="bold" />
            {trend.value}
          </span>
        )}
      </div>
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className="mt-1 text-3xl font-bold tracking-tight text-ink">{value ?? 0}</p>
      {hint && <p className="mt-2 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function EmptyState({ title, description, action, to, icon: Icon = Tray }) {
  const content = action && to ? <Link to={to} className="inline-flex rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">{action}</Link> : action;
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <Icon size={20} weight="light" />
      </div>
      <h2 className="font-semibold text-ink">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">{description}</p>
      {content && <div className="mt-5">{content}</div>}
    </div>
  );
}
