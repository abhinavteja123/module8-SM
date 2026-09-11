import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { Badge } from './ui/badge.jsx';

export default function AttendanceBadge({ studentId, cycleId }) {
  const query = cycleId ? `/attendance/${studentId}?cycle_id=${cycleId}` : `/attendance/${studentId}`;
  const { data } = useQuery({ queryKey: ['attendance', studentId, cycleId], queryFn: () => api(query), enabled: Boolean(studentId), retry: false });
  if (!data || data.total_count === 0) return <Badge status="pending">Attendance: no weeks recorded</Badge>;
  const tone = data.percentage >= 75 ? 'approved' : data.percentage >= 50 ? 'pending' : 'rejected';
  return <Badge status={tone}>Attendance {data.present_count}/{data.total_weeks} weeks ({data.percentage}%)</Badge>;
}
