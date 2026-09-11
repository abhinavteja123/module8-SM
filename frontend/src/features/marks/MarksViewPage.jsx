import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Card } from '../../components/ui/card.jsx';
import { PageHeader, EmptyState } from '../../components/ui/page.jsx';
import AttendanceBadge from '../../components/AttendanceBadge.jsx';

export default function MarksViewPage() {
  const { user } = useAuth();

  const { data: cycle } = useQuery({ queryKey: ['cycle-current'], queryFn: () => api('/cycles/current'), retry: false });
  const { data: marks, isLoading } = useQuery({
    queryKey: ['marks', user.id, cycle?.id],
    queryFn: () => api(`/marks/${user.id}?cycle_id=${cycle.id}`),
    enabled: !!cycle,
  });
  const requirements = (marks?.requirements ?? []).filter((item) => Number(item.max_marks) > 0 && item.is_assessed !== false);

  if (isLoading || !cycle) return <div className="loading-state">Loading your marks…</div>;

  return (
    <div className="max-w-2xl space-y-6"><PageHeader eyebrow="Academic progress" title="My marks" description={`Your marks for ${cycle.name}. Marks are entered by faculty and shown here for reference.`} />
    <Card className="overflow-hidden p-0">
      <div className="border-b border-slate-100 px-6 py-5"><h2 className="font-bold">Assessment summary</h2><p className="form-help">Contact your faculty mentor if you believe a mark needs clarification.</p></div>
      {!requirements.length ? (
        <div className="p-6"><EmptyState title="No marks entered yet" description="Your assessment results will appear here as your mentor records them." /></div>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {requirements.map((item) => (
              <tr key={item.id} className="border-b border-slate-100 last:border-0">
                <td className="px-6 py-4 font-medium text-slate-700">{item.title}</td>
                <td className="px-6 py-4 text-right font-bold text-slate-900">{item.score ?? '—'} / {item.max_marks}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-slate-200 bg-slate-50">
              <td className="px-6 py-4 font-bold text-slate-900">Total</td>
              <td className="px-6 py-4 text-right font-bold text-indigo-700">{marks.total} / {marks.maximum}</td>
            </tr>
            <tr>
              <td className="px-6 py-4 font-medium text-slate-700">Attendance</td>
              <td className="px-6 py-4 text-right"><AttendanceBadge studentId={user.id} /></td>
            </tr>
          </tbody>
        </table>
      )}
    </Card></div>
  );
}
