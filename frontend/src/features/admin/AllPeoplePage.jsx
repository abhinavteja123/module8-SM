import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { PageHeader } from '../../components/ui/page.jsx';
import { PeopleDirectory } from './UserManagement.jsx';
import { useCycle } from '../../cycles/CycleContext.jsx';
import { Card } from '../../components/ui/card.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Select } from '../../components/ui/select.jsx';
import { Button } from '../../components/ui/button.jsx';

function pageText(page, pageSize, total) {
  if (!total) return 'No people shown';
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  return `${first}-${last} of ${total} people`;
}

export default function AllPeoplePage() {
  const queryClient = useQueryClient();
  const { selectedCycle, selectedCycleId } = useCycle();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const { data: schools = [] } = useQuery({ queryKey: ['schools'], queryFn: () => api('/schools') });
  const { data: departments = [] } = useQuery({ queryKey: ['departments'], queryFn: () => api('/departments') });
  const visibleDepartments = schoolId ? departments.filter((department) => department.school_id === schoolId) : departments;
  const params = useMemo(() => {
    // ponytail: no open cycle -> send no cycle_id/page so the backend's bare-array
    // fallback runs and CRCS team (not cycle-bound) still shows up.
    const next = selectedCycleId ? new URLSearchParams({ cycle_id: selectedCycleId, page: String(page), page_size: String(pageSize) }) : new URLSearchParams();
    if (search.trim()) next.set('search', search.trim());
    if (role) next.set('role', role);
    if (schoolId) next.set('school_id', schoolId);
    if (departmentId) next.set('department_id', departmentId);
    return next;
  }, [selectedCycleId, page, search, role, schoolId, departmentId]);
  const { data, isLoading, error } = useQuery({ queryKey: ['portal-users', selectedCycleId, page, pageSize, search, role, schoolId, departmentId], queryFn: () => api(`/admin/users?${params}`), retry: false });
  const { data: studentRecordsData } = useQuery({ queryKey: ['student-records-preview', selectedCycleId, page, pageSize, search, role, schoolId, departmentId], queryFn: () => api(`/admin/student-records?${params}`), enabled: !!selectedCycleId && (!role || role === 'student'), retry: false });
  const users = Array.isArray(data) ? data : data?.items ?? [];
  const total = Array.isArray(data) ? users.length : data?.total ?? users.length;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const cycleParticipantTypes = useMemo(() => new Map(users.map((user) => [user.id, user.participant_type]).filter(([, participantType]) => participantType)), [users]);
  const refresh = () => { queryClient.invalidateQueries({ queryKey: ['portal-users'] }); queryClient.invalidateQueries({ queryKey: ['student-records-preview'] }); };
  const updateFilter = (setter) => (value) => { setter(value); setPage(1); };

  return <div className="max-w-6xl space-y-6"><PageHeader eyebrow={`Directory${selectedCycle ? ` · ${selectedCycle.name}` : ''}`} title="All People" description="Only people enrolled in the selected cycle are shown. Search and filters are server-bounded for large directories." />
    <Card className="p-5"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Input aria-label="Search people" value={search} onChange={(event) => updateFilter(setSearch)(event.target.value)} placeholder="Search name, email, or roll number" /><Select aria-label="Filter by role" value={role} onChange={(event) => updateFilter(setRole)(event.target.value)}><option value="">All roles</option><option value="student">Students</option><option value="faculty">Faculty mentors</option><option value="faculty_coordinator">Faculty coordinators</option><option value="hod">HODs</option><option value="dean">Deans</option><option value="school_office">School office</option><option value="crcs_coordinator">CRCS coordinators</option><option value="crcs_superadmin">CRCS superadmins</option></Select><Select aria-label="Filter by school" value={schoolId} onChange={(event) => { updateFilter(setSchoolId)(event.target.value); setDepartmentId(''); }}><option value="">All schools</option>{schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</Select><Select aria-label="Filter by department" value={departmentId} onChange={(event) => updateFilter(setDepartmentId)(event.target.value)}><option value="">All departments</option>{visibleDepartments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</Select></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-600">{isLoading ? 'Loading people…' : pageText(page, pageSize, total)}</p><div className="flex gap-2"><Button variant="secondary" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1 || isLoading}>Previous</Button><Button variant="secondary" onClick={() => setPage((value) => Math.min(lastPage, value + 1))} disabled={page >= lastPage || isLoading}>Next</Button></div></div></Card>
    {error ? <Card className="border-red-200 bg-red-50 p-5 text-sm text-red-800"><p className="font-semibold">The paginated people endpoint is not ready.</p><p className="mt-1">{error.message}</p></Card> : <PeopleDirectory users={users} schools={schools} departments={departments} studentRecords={studentRecordsData?.records ?? []} cycleParticipantTypes={cycleParticipantTypes} onChanged={refresh} showHeading={false} />}
  </div>;
}
