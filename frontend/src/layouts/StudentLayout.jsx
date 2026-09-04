import { Shell } from './Shell.jsx';

const links = [
  { to: '/', label: 'Track Selection' },
  { to: '/research', label: 'Research' },
  { to: '/opportunities', label: 'Opportunities' },
  { to: '/self-internship', label: 'Self-Internship' },
  { to: '/documents', label: 'Documents' },
  { to: '/marks', label: 'Marks' },
];

export default function StudentLayout() {
  return <Shell title="Student Portal" links={links} />;
}
