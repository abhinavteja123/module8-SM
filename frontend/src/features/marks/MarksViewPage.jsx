import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Card } from '../../components/ui/card.jsx';
import { PageHeader, EmptyState } from '../../components/ui/page.jsx';

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

  if (isLoading || !cycle) return <div className="loading-state">Loading your marks…</div>;

  return (
    <div className="max-w-2xl"><PageHeader eyebrow="Academic progress" title="My marks" description={`Your marks for ${cycle.name}. Marks are entered by faculty and shown here for reference.`} />
    <Card className="overflow-hidden p-0">
      <div className="border-b border-slate-100 px-6 py-5"><h2 className="font-bold">Assessment summary</h2><p className="form-help">Contact your faculty mentor if you believe a mark needs clarification.</p></div>
      {!marks ? (
        <div className="p-6"><EmptyState title="No marks entered yet" description="Your assessment results will appear here as your mentor records them." /></div>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {FIELDS.map(([key, label]) => (
              <tr key={key} className="border-b border-slate-100 last:border-0">
                <td className="px-6 py-4 font-medium text-slate-700">{label}</td>
                <td className="px-6 py-4 text-right font-bold text-slate-900">{marks[key] ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card></div>
  );
}
