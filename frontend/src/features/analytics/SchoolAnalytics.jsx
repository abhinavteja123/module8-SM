import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { AnalyticsSummary } from './AnalyticsSummary.jsx';

export default function SchoolAnalytics() {
  const { user } = useAuth();
  const role = user.roles.find((r) => r.role === 'dean');
  const schoolId = role?.school_id;

  const { data, isLoading, error } = useQuery({
    queryKey: ['analytics-school', schoolId],
    queryFn: () => api(`/analytics/school/${schoolId}`),
    enabled: !!schoolId,
  });

  return <AnalyticsSummary eyebrow="School overview" title="Your school’s internship progress" description="A clear school-level summary for planning and oversight." data={data} isLoading={isLoading} error={error} />;
}
