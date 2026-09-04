export function Card({ className = '', ...props }) {
  return <div className={`bg-white border border-slate-200 rounded-lg shadow-sm ${className}`} {...props} />;
}
