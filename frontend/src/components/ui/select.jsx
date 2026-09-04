export function Select({ className = '', children, ...props }) {
  return (
    <select
      className={`w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}
