import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Card } from '../../components/ui/card.jsx';

export default function SystemAnalytics() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['analytics-system'],
    queryFn: () => api('/analytics/system'),
  });

  return (
    <Card className="p-4 max-w-2xl">
      <h2 className="font-semibold mb-3">System-Wide Analytics</h2>
      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error.message}</p>}
      {data && <pre className="text-xs bg-slate-50 p-3 rounded overflow-auto">{JSON.stringify(data, null, 2)}</pre>}
    </Card>
  );
}
