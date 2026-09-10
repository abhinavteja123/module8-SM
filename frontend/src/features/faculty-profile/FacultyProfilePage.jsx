import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Button } from '../../components/ui/button.jsx';
import { Card } from '../../components/ui/card.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Label } from '../../components/ui/label.jsx';
import { PageHeader } from '../../components/ui/page.jsx';

export default function FacultyProfilePage() {
  const queryClient = useQueryClient();
  const { data: profile, isLoading, error } = useQuery({ queryKey: ['my-faculty-profile'], queryFn: () => api('/research/my-profile') });
  const [cabin, setCabin] = useState('');
  useEffect(() => { if (profile) setCabin(profile.cabin ?? ''); }, [profile]);
  const save = useMutation({
    mutationFn: () => api('/research/my-profile', { method: 'PATCH', body: { cabin: cabin.trim() || null } }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['my-faculty-profile'] }); queryClient.invalidateQueries({ queryKey: ['my-mentor-profile'] }); },
  });

  if (isLoading) return <div className="loading-state">Loading your faculty profile…</div>;
  if (error) return <p className="text-sm text-red-600">{error.message}</p>;
  return <div className="max-w-3xl space-y-6"><PageHeader eyebrow="Faculty profile" title="Keep your mentor details current" description="Students see your official email, phone number, and cabin after you are assigned as their faculty mentor." />
    <Card className="p-6"><form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}><div><Label>Full name</Label><Input value={profile.full_name ?? ''} disabled /></div><div><Label>Email</Label><Input value={profile.email ?? ''} disabled /></div><div><Label>Phone</Label><Input value={profile.phone ?? 'Not provided'} disabled /></div><div><Label>Mentor category</Label><Input value={profile.mentorship_scope === 'crcs_self' ? 'CRCS and self-internship mentor' : 'Research internship mentor'} disabled /></div><div className="sm:col-span-2"><Label>Faculty cabin</Label><Input value={cabin} onChange={(event) => setCabin(event.target.value)} maxLength={200} placeholder="For example, C-204" /><p className="form-help mt-2">You own this field. Update it here whenever your cabin changes; CRCS does not enter or maintain it.</p></div><div className="sm:col-span-2">{save.isError && <p className="text-sm text-red-600">{save.error.message}</p>}{save.isSuccess && <p className="text-sm text-emerald-700">Cabin details saved. Students will see the updated value in their mentor details.</p>}<Button type="submit" className="mt-4" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save cabin details'}</Button></div></form></Card>
  </div>;
}
