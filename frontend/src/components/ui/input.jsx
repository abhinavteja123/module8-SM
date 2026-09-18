export function Input({ className = '', type = 'text', error = false, success = false, ...props }) {
  const state = error
    ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
    : success
      ? 'border-emerald-400 focus:border-emerald-500 focus:ring-emerald-100'
      : 'border-slate-300 hover:border-slate-400 focus:border-brand-500 focus:ring-brand-100';
  return (
    <input
      type={type}
      className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-ink shadow-sm shadow-slate-900/[0.03] transition placeholder:text-slate-400 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-100 ${state} ${className}`}
      {...props}
    />
  );
}
