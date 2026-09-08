import { Shell } from './Shell.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { hasRole } from '../lib/permissions.js';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

export default function CRCSLayout() {
  const { user } = useAuth();
  const isSuperadmin = hasRole(user, 'crcs_superadmin');
  const isCoordinator = hasRole(user, 'crcs_coordinator');
  const { data: permissionData } = useQuery({
    queryKey: ['crcs-my-permissions'],
    queryFn: () => api('/admin/crcs-coordinator-permissions/me'),
    enabled: isCoordinator && !isSuperadmin,
    retry: false,
  });
  const can = (key) => isSuperadmin || !!permissionData?.permissions?.[key];
  const links = [];
  if (isSuperadmin) links.push({ to: '/', label: 'Overview' });
  if (can('view_opportunities')) links.push({ to: '/opportunities', label: 'Opportunities' });
  if (can('view_research_approvals')) links.push({ to: '/approvals', label: 'Approvals' });
  if (isSuperadmin) links.push({ to: '/mentor-allocations', label: 'Mentor Allocations' });
  if (isSuperadmin) {
    links.push({ to: '/templates', label: 'Report Types' });
    links.push({ to: '/marks', label: 'Student Marks' });
    links.push({ to: '/analytics', label: 'Programme Analytics' });
    links.push({ to: '/people', label: 'All People' });
    links.push({ to: '/admin/users', label: 'User Management' });
  }
  return <Shell title="CRCS Portal" links={links} basePath="/crcs" />;
}
