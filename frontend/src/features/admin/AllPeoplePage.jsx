import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { PageHeader } from '../../components/ui/page.jsx';
import { PeopleDirectory } from './UserManagement.jsx';

export default function AllPeoplePage() {
  const queryClient = useQueryClient();
  const { data: schools = [] } = useQuery({ queryKey: ['schools'], queryFn: () => api('/schools') });
  const { data: departments = [] } = useQuery({ queryKey: ['departments'], queryFn: () => api('/departments') });
  const { data: users = [] } = useQuery({ queryKey: ['portal-users'], queryFn: () => api('/admin/users') });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['portal-users'] });

  return <div className="max-w-5xl"><PageHeader eyebrow="Directory" title="All People" description="Find people by school, department, or role. Edit details or safely move their responsibilities before removing portal access." /><PeopleDirectory users={users} schools={schools} departments={departments} onChanged={refresh} showHeading={false} /></div>;
}
