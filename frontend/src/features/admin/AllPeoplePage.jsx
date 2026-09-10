import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { PageHeader } from '../../components/ui/page.jsx';
import { PeopleDirectory } from './UserManagement.jsx';
import { useCycle } from '../../cycles/CycleContext.jsx';

export default function AllPeoplePage() {
  const queryClient = useQueryClient();
  const { selectedCycle, selectedCycleId } = useCycle();
  const { data: schools = [] } = useQuery({ queryKey: ['schools'], queryFn: () => api('/schools') });
  const { data: departments = [] } = useQuery({ queryKey: ['departments'], queryFn: () => api('/departments') });
  const { data: users = [] } = useQuery({ queryKey: ['portal-users'], queryFn: () => api('/admin/users') });
  const { data: participantData } = useQuery({ queryKey: ['cycle-participants', selectedCycleId], queryFn: () => api(`/cycles/${selectedCycleId}/participants`), enabled: !!selectedCycleId });
  const { data: studentRecordsData } = useQuery({ queryKey: ['student-records', selectedCycleId], queryFn: () => api(`/admin/student-records?cycle_id=${selectedCycleId}`), enabled: !!selectedCycleId });
  const participantIds = useMemo(() => new Set((participantData?.participants ?? []).map((participant) => participant.user_id)), [participantData]);
  const cycleParticipantTypes = useMemo(() => new Map((participantData?.participants ?? []).map((participant) => [participant.user_id, participant.participant_type])), [participantData]);
  const cycleUsers = useMemo(() => users.filter((user) => participantIds.has(user.id)), [users, participantIds]);
  const refresh = () => { queryClient.invalidateQueries({ queryKey: ['portal-users'] }); queryClient.invalidateQueries({ queryKey: ['cycle-participants', selectedCycleId] }); };

  return <div className="max-w-5xl"><PageHeader eyebrow={`Directory${selectedCycle ? ` · ${selectedCycle.name}` : ''}`} title="All People" description="Only people enrolled in the selected cycle are shown. Student cards and application status are also calculated for that cycle." /><PeopleDirectory users={cycleUsers} schools={schools} departments={departments} studentRecords={studentRecordsData?.records ?? []} cycleParticipantTypes={cycleParticipantTypes} onChanged={refresh} showHeading={false} /></div>;
}
