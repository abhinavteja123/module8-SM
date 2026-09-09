import { OperationalAnalyticsDashboard } from './OperationalAnalyticsDashboard.jsx';

// Kept as the public component name for existing analytics routes.
export function AnalyticsSummary({ eyebrow, title, description }) {
  return <OperationalAnalyticsDashboard eyebrow={eyebrow} title={title} description={description} />;
}
