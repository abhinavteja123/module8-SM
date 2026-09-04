import { Shell } from './Shell.jsx';

const links = [
  { to: '/', label: 'My Projects' },
  { to: '/applications', label: 'Applications' },
  { to: '/documents', label: 'Reviews' },
  { to: '/marks', label: 'Marks Entry' },
  { to: '/self-internship-reviews', label: 'Self-Internship Reviews' },
];

export default function FacultyLayout() {
  return <Shell title="Faculty Portal" links={links} />;
}
