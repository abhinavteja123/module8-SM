import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { AnalyticsSummary } from './AnalyticsSummary.jsx';

export default function SystemAnalytics() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['analytics-system'],
    queryFn: () => api('/analytics/system'),
  });

  return <AnalyticsSummary eyebrow="CRCS overview" title="Internship programme at a glance" description="See the workload, student activity, and approval progress across the institution." data={data} isLoading={isLoading} error={error} />;
}
