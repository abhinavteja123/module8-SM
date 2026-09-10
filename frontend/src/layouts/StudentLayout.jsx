import { Shell } from './Shell.jsx';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

export default function StudentLayout() {
  const { data: preference } = useQuery({ queryKey: ['my-track-selection'], queryFn: () => api('/students/me/track-selection'), retry: false });
  const track = preference?.selection?.track;
  const dashboard = track === 'research' ? { to: '/research', label: 'My Research Internship' }
    : track === 'crcs_opportunity' ? { to: '/opportunities', label: 'My CRCS Opportunities' }
      : track === 'self_internship' ? { to: '/self-internship', label: 'My Self-Internship' }
        : null;
  const links = [
    { to: '/', label: dashboard?.label ?? 'Choose Internship Path' },
    { to: '/profile', label: 'My Profile' },
    { to: '/preference', label: 'Internship Preference' },
    { to: '/applications', label: 'My Applications' },
    { to: '/mentor-details', label: 'My Mentor Details' },
    { to: '/documents', label: 'My Documents' },
  ];
  return <Shell title="Student Portal" links={links} basePath="/student" />;
}
