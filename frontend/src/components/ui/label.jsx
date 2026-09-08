export function Label({ className = '', ...props }) {
  return <label className={`mb-1.5 block text-sm font-semibold text-slate-700 ${className}`} {...props} />;
}
