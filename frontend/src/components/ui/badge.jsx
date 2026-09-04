const colors = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  revoked: 'bg-slate-200 text-slate-600',
  default: 'bg-slate-100 text-slate-700',
};

function colorFor(status) {
  const key = Object.keys(colors).find((k) => status?.toLowerCase().includes(k));
  return colors[key] ?? colors.default;
}

export function Badge({ status, children, className = '' }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${colorFor(status)} ${className}`}>
      {children ?? status}
    </span>
  );
}
