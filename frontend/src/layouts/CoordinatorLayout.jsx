import { Shell } from './Shell.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { hasRole } from '../lib/permissions.js';

export default function CoordinatorLayout() {
  const { user } = useAuth();
  const links = [{ to: '/', label: 'Analytics' }];
  if (hasRole(user, 'faculty_coordinator')) links.push({ to: '/reassignment', label: 'Mentor Reassignment' });
  return <Shell title="Coordinator / HOD / Dean" links={links} />;
}
