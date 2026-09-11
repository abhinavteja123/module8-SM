import { Shell } from './Shell.jsx';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { useCycle } from '../cycles/CycleContext.jsx';

export default function StudentLayout() {
  const { selectedCycleId } = useCycle();
  const { data: preference } = useQuery({ queryKey: ['my-track-selection', selectedCycleId], queryFn: () => api(`/students/me/track-selection?cycle_id=${selectedCycleId}`), enabled: !!selectedCycleId, retry: false });
  const track = preference?.selection?.track;
  const dashboard = track === 'research' ? { to: '/research', label: 'My Research Internship' }
    : track === 'crcs_opportunity' ? { to: '/opportunities', label: 'My CRCS Opportunities' }
      : track === 'self_internship' ? { to: '/self-internship', label: 'My Self-Internship' }
        : null;
  const links = [
    { to: dashboard?.to ?? '/preference', label: dashboard?.label ?? 'Choose Internship Path' },
    { to: '/profile', label: 'My Profile' },
    { to: '/preference', label: 'Internship Preference' },
    { to: '/applications', label: 'My Applications' },
    { to: '/mentor-details', label: 'My Mentor Details' },
    { to: '/documents', label: 'My Documents' },
    { to: '/marks', label: 'My Marks & Attendance' },
  ];
  return <Shell title="Student Portal" links={links} basePath="/student" />;
}
