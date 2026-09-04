import { Shell } from './Shell.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { hasRole } from '../lib/permissions.js';

export default function CRCSLayout() {
  const { user } = useAuth();
  const links = [
    { to: '/', label: 'Opportunities' },
    { to: '/research-approvals', label: 'Research Approvals' },
    { to: '/self-internship-approvals', label: 'Self-Internship Approvals' },
    { to: '/templates', label: 'Report Templates' },
    { to: '/marks', label: 'Marks Override' },
    { to: '/analytics', label: 'Analytics' },
  ];
  if (hasRole(user, 'crcs_superadmin')) {
    links.push({ to: '/admin/users', label: 'User Management' });
    links.push({ to: '/admin/permissions', label: 'Coordinator Permissions' });
    links.push({ to: '/admin/audit-log', label: 'Audit Log' });
  }
  return <Shell title="CRCS Portal" links={links} />;
}
