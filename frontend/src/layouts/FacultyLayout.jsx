import { Shell } from './Shell.jsx';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

const researchLinks = [
  { to: '/', label: 'My research projects', group: 'Project workspace' },
  { to: '/applications', label: 'Applications to review', group: 'Project workspace' },
  { to: '/mentor-allocations', label: 'My mentored students', group: 'Student supervision' },
  { to: '/documents', label: 'Review student reports', group: 'Student supervision' },
  { to: '/report-deadlines', label: 'Set report deadlines', group: 'Student supervision' },
  { to: '/marks', label: 'Enter student marks', group: 'Assessment' },
];

export default function FacultyLayout() {
  const { data: profile } = useQuery({ queryKey: ['my-mentor-profile'], queryFn: () => api('/research/my-mentor-profile'), retry: false });
  const directLinks = [
    { to: '/mentor-allocations', label: 'My allocated students', group: 'Student supervision' },
    { to: '/report-deadlines', label: 'Set report deadlines', group: 'Student supervision' },
    { to: '/documents', label: 'Review student reports', group: 'Student supervision' },
    { to: '/marks', label: 'Award student marks', group: 'Assessment' },
  ];
  const isDirectMentor = profile?.mentorship_scope === 'crcs_self';
  return <Shell title={isDirectMentor ? 'Faculty Internship Mentor' : 'Faculty Research Portal'} links={isDirectMentor ? directLinks : researchLinks} basePath="/faculty" />;
}
