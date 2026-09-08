export function Select({ className = '', children, ...props }) {
  return (
    <select
      className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm shadow-slate-100 transition hover:border-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100 ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}
