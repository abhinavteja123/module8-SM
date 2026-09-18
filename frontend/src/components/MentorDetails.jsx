import { EnvelopeSimple, Phone, MapPin, SealCheck } from '@phosphor-icons/react';

export default function MentorDetails({ mentor, className = '', compact = false }) {
  if (!mentor) return null;
  const fields = [
    ['Email', mentor.email || 'Not available', mentor.email ? `mailto:${mentor.email}` : null, EnvelopeSimple],
    ['Phone', mentor.phone || 'Not available', mentor.phone ? `tel:${mentor.phone}` : null, Phone],
    ['Cabin', mentor.cabin || 'Not updated yet', null, MapPin],
  ];
  if (compact) {
    return (
      <div className={`mt-3 text-sm text-slate-700 ${className}`}>
        <p className="font-semibold text-ink">Mentor: {mentor.full_name}</p>
        {fields.map(([label, value, href, Icon]) => (
          <p key={label} className="mt-1 flex items-center gap-1.5">
            <Icon size={13} weight="light" className="shrink-0 text-slate-400" />
            <span className="font-medium">{label}:</span> {href ? <a className="text-brand-700 underline" href={href}>{value}</a> : value}
          </p>
        ))}
      </div>
    );
  }
  return (
    <section className={`mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950 ${className}`}>
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-emerald-800"><SealCheck size={14} weight="bold" />My mentor details</p>
      <p className="mt-1 text-lg font-semibold">{mentor.full_name ?? 'Faculty mentor'}</p>
      <div className="mt-4 grid gap-4 text-sm min-[480px]:grid-cols-3">
        {fields.map(([label, value, href, Icon]) => (
          <div key={label} className="min-w-0">
            <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-emerald-800"><Icon size={12} weight="light" />{label}</p>
            {href ? <a className="mt-1 block break-words font-medium text-brand-700 underline" href={href}>{value}</a> : <p className="mt-1 break-words font-medium">{value}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
