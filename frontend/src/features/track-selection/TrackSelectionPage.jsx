import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { Card } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { PageHeader, EmptyState } from '../../components/ui/page.jsx';

const TRACKS = [
  { value: 'research', label: 'Research Internship', detail: 'Work with a faculty mentor on a university research project.', hint: 'Faculty guided' },
  { value: 'crcs_opportunity', label: 'CRCS Opportunity', detail: 'Apply to internship opportunities published by CRCS.', hint: 'Organisation based' },
  { value: 'self_internship', label: 'Self-Internship', detail: 'Submit an internship you arranged directly with a company.', hint: 'Direct CRCS approval' },
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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['my-track-selection'] });
      if (!data.requires_approval) navigate({ research: '/student/research', crcs_opportunity: '/student/opportunities', self_internship: '/student/self-internship' }[track]);
    },
  });

  if (isLoading) return <div className="loading-state">Loading internship cycle details…</div>;
  if (cycleError) return <EmptyState title="No internship cycle is open right now" description="Please check back when CRCS opens the next cycle." />;

  const approvalLocked = !!preference?.approval_locked;
  const locked = !!preference?.cycle?.preference_changes_locked;
  const currentTrack = preference?.selection?.track;
  const pendingRequest = preference?.pending_request;
  const requestingChange = locked && !!currentTrack && currentTrack !== track;
  const actionLabel = pendingRequest ? 'Preference-change request pending' : requestingChange ? 'Request preference change' : locked && currentTrack === track ? 'Preference changes are locked' : currentTrack ? 'Save updated preference' : 'Save my preference';
  return (<div className="max-w-3xl"><PageHeader eyebrow="Start here" title="Choose how you want to intern" description="Your saved preference opens the matching internship dashboard." />
    <Card className="p-6">
      <h2 className="font-bold">{cycle.name}</h2>
      {approvalLocked ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950"><p className="font-semibold">Your internship preference is locked after approval.</p><p className="mt-2 text-sm">Selected path: <strong>{TRACKS.find((item) => item.value === currentTrack)?.label ?? 'Internship track'}</strong>.</p><p className="mt-2 text-sm">If any change is needed, please contact the CRCS administrator in person.</p></div> : <><p className="form-help mb-5">Choose one internship path. You can explore the available opportunities after saving your preference.</p>
      {locked && <div className="inline-notice mb-5 border-amber-200 bg-amber-50 text-amber-900">Preference changes are currently locked by CRCS.{pendingRequest ? ` Your request to change to ${TRACKS.find((item) => item.value === pendingRequest.requested_track)?.label ?? 'a new path'} is waiting for approval.` : ' Choose another path only to send CRCS a change request.'}</div>}

      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">{TRACKS.map((item) => { const selected = track === item.value; return <button key={item.value} type="button" onClick={() => setTrack(item.value)} className={`rounded-xl border p-4 text-left transition ${selected ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100' : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50'}`}><p className="text-xs font-bold uppercase tracking-wide text-indigo-600">{item.hint}</p><p className="mt-3 font-bold text-slate-950">{item.label}</p><p className="mt-2 text-sm leading-5 text-slate-600">{item.detail}</p><p className={`mt-4 text-sm font-bold ${selected ? 'text-indigo-700' : 'text-slate-400'}`}>{selected ? 'Selected ✓' : 'Select option'}</p></button>; })}</div>
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !!pendingRequest || (locked && currentTrack === track)}>
          {mutation.isPending ? (requestingChange ? 'Sending request…' : 'Saving…') : actionLabel}
        </Button>
        {mutation.isSuccess && <p className="inline-notice border-emerald-200 bg-emerald-50 text-emerald-800">{mutation.data?.requires_approval ? 'Your preference-change request has been sent to CRCS.' : 'Your preferred internship path has been saved. Opening your dashboard…'}</p>}
        {mutation.isError && <p className="text-sm text-red-600">{mutation.error.message}</p>}
      </div></>}
    </Card></div>);
}
