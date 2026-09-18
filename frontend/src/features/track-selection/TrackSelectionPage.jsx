import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Flask, Buildings, RocketLaunch, CheckCircle, LockSimple, WarningCircle } from '@phosphor-icons/react';
import { api } from '../../lib/api.js';
import { Card } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { PageHeader, EmptyState } from '../../components/ui/page.jsx';
import { Skeleton } from '../../components/ui/skeleton.jsx';

const TRACKS = [
  { value: 'research', label: 'Research Internship', detail: 'Work with a faculty mentor on a university research project.', hint: 'Faculty guided', icon: Flask },
  { value: 'crcs_opportunity', label: 'CRCS Internships', detail: 'Choose a campus-exclusive CRCS role or an open-source role published by CRCS.', hint: 'CRCS listings', icon: Buildings },
  { value: 'self_internship', label: 'Self-Internship', detail: 'Submit an internship you arranged directly with a company.', hint: 'Direct CRCS approval', icon: RocketLaunch },
];

export default function TrackSelectionPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: cycle, isLoading, error: cycleError } = useQuery({
    queryKey: ['cycle-current'],
    queryFn: () => api('/cycles/current'),
    retry: false,
  });
  const [track, setTrack] = useState('research');
  const { data: preference } = useQuery({ queryKey: ['my-track-selection'], queryFn: () => api('/students/me/track-selection'), retry: false });
  useEffect(() => { if (preference?.selection?.track) setTrack(preference.selection.track); }, [preference?.selection?.track]);

  const mutation = useMutation({
    mutationFn: () =>
      api('/students/me/track-selection', {
        method: 'POST',
        body: { cycle_id: cycle.id, track },
      }),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ['my-track-selection'] });
      if (!data.requires_approval) navigate({ research: '/student/research', crcs_opportunity: '/student/opportunities', self_internship: '/student/self-internship' }[track]);
    },
  });

  if (isLoading) {
    return (
      <div className="max-w-3xl space-y-6">
        <Skeleton className="h-20 w-full" />
        <div className="portal-card space-y-5 p-6">
          <Skeleton className="h-5 w-40" />
          <div className="grid gap-3 sm:grid-cols-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      </div>
    );
  }
  if (cycleError) return <EmptyState title="No internship cycle is open right now" description="Please check back when CRCS opens the next cycle." />;

  const approvalLocked = !!preference?.approval_locked;
  const locked = !!preference?.cycle?.preference_changes_locked;
  const currentTrack = preference?.selection?.track;
  const requestingChange = locked && !!currentTrack && currentTrack !== track;
  const actionLabel = locked ? 'Preference changes are locked' : currentTrack ? 'Save updated preference' : 'Save my preference';

  return (
    <div className="max-w-3xl">
      <PageHeader
        breadcrumb={[{ label: 'Home', to: '/student' }, { label: 'Internship Preference' }]}
        eyebrow="Start here"
        title="Choose how you want to intern"
        description="Your saved preference opens the matching internship dashboard."
      />
      <Card className="p-6">
        <h2 className="font-bold">{cycle.name}</h2>
        {approvalLocked ? (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
            <LockSimple size={20} weight="light" className="mt-0.5 shrink-0 text-emerald-700" />
            <div>
              <p className="font-semibold">Your internship preference is locked after approval.</p>
              <p className="mt-2 text-sm">Selected path: <strong>{TRACKS.find((item) => item.value === currentTrack)?.label ?? 'Internship track'}</strong>.</p>
              <p className="mt-2 text-sm">If any change is needed, please contact the CRCS administrator in person.</p>
            </div>
          </div>
        ) : (
          <>
            <p className="form-help mb-5">Choose one internship path. You can explore the available opportunities after saving your preference.</p>
            {locked && (
              <div className="inline-notice mb-5 flex items-start gap-2 border-amber-200 bg-amber-50 text-amber-900">
                <WarningCircle size={16} weight="fill" className="mt-0.5 shrink-0" />
                <span>Preference changes are now locked by CRCS. Contact CRCS directly if you need a change.</span>
              </div>
            )}

            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-3">
                {TRACKS.map((item, i) => {
                  const selected = track === item.value;
                  const Icon = item.icon;
                  return (
                    <motion.button
                      key={item.value}
                      type="button"
                      onClick={() => setTrack(item.value)}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, delay: i * 0.04 }}
                      className={`rounded-2xl border p-4 text-left transition ${selected ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100' : 'border-slate-200 bg-white hover:border-brand-300 hover:bg-slate-50'}`}
                    >
                      <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ${selected ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        <Icon size={18} weight="light" />
                      </div>
                      <p className="text-xs font-bold uppercase tracking-wide text-brand-600">{item.hint}</p>
                      <p className="mt-3 font-bold text-ink">{item.label}</p>
                      <p className="mt-2 text-sm leading-5 text-slate-600">{item.detail}</p>
                      <p className={`mt-4 flex items-center gap-1 text-sm font-bold ${selected ? 'text-brand-700' : 'text-slate-400'}`}>
                        {selected && <CheckCircle size={15} weight="fill" />}
                        {selected ? 'Selected' : 'Select option'}
                      </p>
                    </motion.button>
                  );
                })}
              </div>
              <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || locked}>
                {mutation.isPending ? 'Saving…' : actionLabel}
              </Button>
              {requestingChange && <p className="text-sm text-amber-800">This different option cannot be saved after the lock. Please contact CRCS.</p>}
              {mutation.isSuccess && <p className="inline-notice border-emerald-200 bg-emerald-50 text-emerald-800">Your preferred internship path has been saved. Opening your dashboard…</p>}
              {mutation.isError && <p className="text-sm text-red-600">{mutation.error.message}</p>}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
