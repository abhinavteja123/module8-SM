import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FloppyDisk, WarningCircle, CheckCircle } from '@phosphor-icons/react';
import { api } from '../../lib/api.js';
import { Button } from '../../components/ui/button.jsx';
import { Card } from '../../components/ui/card.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Label } from '../../components/ui/label.jsx';
import { PageHeader } from '../../components/ui/page.jsx';
import { Skeleton, SkeletonText } from '../../components/ui/skeleton.jsx';
import { useToast } from '../../components/ui/toast.jsx';
import UnlockRequestPanel from '../locks/UnlockRequestPanel.jsx';

export default function StudentProfilePage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: profile, isLoading, error } = useQuery({ queryKey: ['my-student-profile'], queryFn: () => api('/students/me/profile') });
  const [form, setForm] = useState({ phone: '' });
  useEffect(() => { if (profile) setForm({ phone: profile.phone ?? '' }); }, [profile]);
  const save = useMutation({
    mutationFn: () => api('/students/me/profile', { method: 'PATCH', body: { phone: form.phone.trim() || null } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-student-profile'] });
      toast.success('Profile saved. Reviewers will see your latest details.');
    },
  });
  const field = (name) => (event) => setForm((current) => ({ ...current, [name]: event.target.value }));

  if (isLoading) {
    return (
      <div className="max-w-3xl space-y-6">
        <Skeleton className="h-20 w-full" />
        <div className="portal-card space-y-5 p-6">
          <SkeletonText lines={4} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </div>
    );
  }
  if (error) return <p className="text-sm text-red-600">{error.message}</p>;

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        breadcrumb={[{ label: 'Home', to: '/student' }, { label: 'My Profile' }]}
        eyebrow="Student profile"
        title="Keep your application details current"
        description="CRCS uses these details when reviewing your internship applications."
      />
      <UnlockRequestPanel />
      <Card className="p-6">
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
          <div><Label>Full name</Label><Input value={profile.full_name} disabled /></div>
          <div><Label>Email</Label><Input value={profile.email} disabled /></div>
          <div><Label>Phone</Label><Input value={form.phone} onChange={field('phone')} placeholder="9876543210" /></div>
          <div><Label>Current CGPA</Label><Input value={profile.cgpa ?? ''} disabled /></div>
          <div><Label>Roll number</Label><Input value={profile.roll_number ?? ''} disabled /></div>
          <div><Label>Batch year</Label><Input value={profile.batch_year ?? ''} disabled /></div>
          <div><Label>Department</Label><Input value={profile.department?.name ?? ''} disabled /></div>
          <div className="sm:col-span-2"><Label>School</Label><Input value={profile.department?.school?.name ?? ''} disabled /></div>
          <div className="sm:col-span-2">
            <p className="form-help">CGPA, roll number, batch, department, and school are maintained by CRCS. Update your phone number above so reviewers can reach you.</p>
            {save.isError && (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-red-600">
                <WarningCircle size={15} weight="fill" />{save.error.message}
              </p>
            )}
            {save.isSuccess && (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-emerald-700">
                <CheckCircle size={15} weight="fill" />Profile saved. Reviewers will see your latest details.
              </p>
            )}
            <Button type="submit" className="mt-4" disabled={save.isPending}>
              <FloppyDisk size={16} weight="bold" />
              {save.isPending ? 'Saving…' : 'Save profile'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
