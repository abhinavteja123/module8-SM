import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Card } from '../../components/ui/card.jsx';

const FIELDS = [
  ['weekly_report_score', 'Weekly Report'],
  ['mid_marks', 'Mid Marks'],
  ['synopsis_marks', 'Synopsis'],
  ['thesis_marks', 'Thesis'],
  ['ppt_marks', 'PPT'],
  ['viva_marks', 'Viva'],
];

export default function MarksViewPage() {
  const { user } = useAuth();

  const { data: cycle } = useQuery({ queryKey: ['cycle-current'], queryFn: () => api('/cycles/current') });
  const { data: marks, isLoading } = useQuery({
    queryKey: ['marks', user.id, cycle?.id],
    queryFn: () => api(`/marks/${user.id}?cycle_id=${cycle.id}`),
    enabled: !!cycle,
  });

  if (isLoading || !cycle) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <Card className="p-4 max-w-md">
      <h2 className="font-semibold mb-3">My Marks — {cycle.name}</h2>
      {!marks ? (
        <p className="text-sm text-slate-500">No marks entered yet.</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {FIELDS.map(([key, label]) => (
              <tr key={key} className="border-b border-slate-100">
                <td className="py-1 text-slate-600">{label}</td>
                <td className="py-1 text-right font-medium">{marks[key] ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
