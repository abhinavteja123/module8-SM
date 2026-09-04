import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Card } from '../../components/ui/card.jsx';

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

  if (!departmentId) return <p className="text-sm text-slate-500">No department scope on this account.</p>;

  return (
    <Card className="p-4 max-w-2xl">
      <h2 className="font-semibold mb-3">Department Analytics</h2>
      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error.message}</p>}
      {data && <pre className="text-xs bg-slate-50 p-3 rounded overflow-auto">{JSON.stringify(data, null, 2)}</pre>}
    </Card>
  );
}
