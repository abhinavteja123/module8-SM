import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { AnalyticsSummary } from './AnalyticsSummary.jsx';

// ponytail: aggregate shape from the backend isn't frozen — rendered as a raw JSON dump.
export default function DepartmentAnalytics() {
  const { user } = useAuth();
  const role = user.roles.find((r) => r.role === 'hod' || r.role === 'faculty_coordinator');
  const departmentId = role?.department_id;

  const { data, isLoading, error } = useQuery({
    queryKey: ['analytics-department', departmentId],
    queryFn: () => api(`/analytics/department/${departmentId}`),
    enabled: !!departmentId,
  });

  return <AnalyticsSummary eyebrow="Department overview" title="Your department’s internship progress" description="Monitor students, faculty activity, and applications within your department." data={data} isLoading={isLoading} error={error} />;
}
