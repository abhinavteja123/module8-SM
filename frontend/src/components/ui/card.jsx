export function Card({ className = '', ...props }) {
  return <section className={`portal-card ${className}`} {...props} />;
}
