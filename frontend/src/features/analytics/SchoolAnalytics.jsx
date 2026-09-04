import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Card } from '../../components/ui/card.jsx';

export default function SchoolAnalytics() {
  const { user } = useAuth();
  const role = user.roles.find((r) => r.role === 'dean');
  const schoolId = role?.school_id;

  const { data, isLoading, error } = useQuery({
    queryKey: ['analytics-school', schoolId],
    queryFn: () => api(`/analytics/school/${schoolId}`),
    enabled: !!schoolId,
  });

  if (!schoolId) return <p className="text-sm text-slate-500">No school scope on this account.</p>;

  return (
    <Card className="p-4 max-w-2xl">
      <h2 className="font-semibold mb-3">School Analytics</h2>
      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error.message}</p>}
      {data && <pre className="text-xs bg-slate-50 p-3 rounded overflow-auto">{JSON.stringify(data, null, 2)}</pre>}
    </Card>
  );
}
