export default function MentorDetails({ mentor, className = '', compact = false }) {
  if (!mentor) return null;
  const fields = [
    ['Email', mentor.email || 'Not available', mentor.email ? `mailto:${mentor.email}` : null],
    ['Phone', mentor.phone || 'Not available', mentor.phone ? `tel:${mentor.phone}` : null],
    ['Cabin', mentor.cabin || 'Not updated yet', null],
  ];
  if (compact) return <div className={`mt-3 text-sm text-slate-700 ${className}`}><p className="font-semibold text-slate-950">Mentor: {mentor.full_name}</p>{fields.map(([label, value, href]) => <p key={label} className="mt-1"><span className="font-medium">{label}:</span> {href ? <a className="text-indigo-700 underline" href={href}>{value}</a> : value}</p>)}</div>;
  return <section className={`mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950 ${className}`}><p className="text-xs font-bold uppercase tracking-wide text-emerald-800">My mentor details</p><p className="mt-1 text-lg font-semibold">{mentor.full_name ?? 'Faculty mentor'}</p><div className="mt-4 grid gap-4 text-sm min-[480px]:grid-cols-3">{fields.map(([label, value, href]) => <div key={label} className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">{label}</p>{href ? <a className="mt-1 block break-words font-medium text-indigo-700 underline" href={href}>{value}</a> : <p className="mt-1 break-words font-medium">{value}</p>}</div>)}</div></section>;
}
