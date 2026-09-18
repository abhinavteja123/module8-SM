import { CheckCircle, Clock, XCircle, Prohibit, Question, CircleDashed } from '@phosphor-icons/react';

const colors = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  active: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-800',
  inactive: 'bg-red-100 text-red-800',
  revoked: 'bg-slate-200 text-slate-600',
  under_review: 'bg-brand-100 text-brand-700',
  unknown: 'bg-slate-100 text-slate-600',
  default: 'bg-slate-100 text-slate-700',
};

const icons = {
  pending: Clock,
  approved: CheckCircle,
  active: CheckCircle,
  rejected: XCircle,
  inactive: Prohibit,
  revoked: Prohibit,
  under_review: CircleDashed,
  unknown: Question,
};

function keyFor(status) {
  const normalized = status?.toLowerCase().replace(/\s+/g, '_');
  return Object.keys(colors).find((k) => normalized?.includes(k)) ?? 'default';
}

export function Badge({ status, children, className = '' }) {
  const key = keyFor(status);
  const Icon = icons[key];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colors[key]} ${className}`}>
      {Icon && <Icon weight="fill" size={12} />}
      {children ?? status}
    </span>
  );
}
