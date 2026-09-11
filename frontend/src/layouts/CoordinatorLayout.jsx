import { Shell } from './Shell.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { hasRole } from '../lib/permissions.js';

export default function CoordinatorLayout() {
  const { user } = useAuth();
  const links = [{ to: '/', label: 'My Overview' }];
  if (hasRole(user, 'hod', 'dean', 'school_office')) { links.push({ to: '/overview', label: 'Organisation Overview' }); links.push({ to: '/student-records', label: 'Student Records' }); }
  if (hasRole(user, 'hod', 'dean', 'school_office', 'faculty_coordinator')) links.push({ to: '/activity', label: 'Activity Monitor' });
  if (hasRole(user, 'dean')) links.push({ to: '/school', label: 'School Overview' });
  if (hasRole(user, 'faculty_coordinator')) links.push({ to: '/reassignment', label: 'Reassign Student Mentors' });
  if (hasRole(user, 'hod') || hasRole(user, 'faculty_coordinator') || hasRole(user, 'school_office')) links.push({ to: '/mentor-allocations', label: 'Mentor Allocations' });
  return <Shell title={hasRole(user, 'school_office') ? 'School Office Portal' : 'Coordinator / HOD / Dean'} links={links} basePath="/coordinator" />;
}
