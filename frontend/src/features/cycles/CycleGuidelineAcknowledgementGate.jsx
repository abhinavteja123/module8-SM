import { useEffect, useState } from 'react';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { documentPreviewUrl } from '../../lib/documentPreview.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useCycle } from '../../cycles/CycleContext.jsx';
import { hasRole } from '../../lib/permissions.js';
import { Button } from '../../components/ui/button.jsx';
import { Card } from '../../components/ui/card.jsx';

export function CycleGuidelineAcknowledgementGate({ children }) {
  const { user } = useAuth();
  const { cycles, selectedCycle, isLoading: isLoadingCycles } = useCycle();
  const queryClient = useQueryClient();
  const [agreedIds, setAgreedIds] = useState([]);
  // This is an onboarding gate, not a publishing gate.  Once a person is
  // enrolled, required PDFs apply in a draft as well as an open cycle.  A
  // person added after other participants therefore gets their own pending
  // acknowledgement automatically.  The superadmin remains exempt because
  // that role manages the documents themselves.
  const shouldCheck = Boolean(user && !hasRole(user, 'crcs_superadmin'));
  const acknowledgementCycles = shouldCheck ? cycles.filter((cycle) => ['not_started', 'open'].includes(cycle.status)) : [];
  const statusQueries = useQueries({
    queries: acknowledgementCycles.map((cycle) => ({
      queryKey: ['cycle-guideline-status', cycle.id, user?.id],
      queryFn: () => api(`/cycle-documents/${cycle.id}/status`),
      staleTime: 15_000,
    })),
  });
  const statusByCycle = new Map(acknowledgementCycles.map((cycle, index) => [cycle.id, statusQueries[index]]));
  // Check every active enrolled cycle, rather than only the one left in local
  // storage. This is what makes a later enrolment immediately surface its own
  // required PDFs at the person's next sign-in.
  const cyclesInAcknowledgementOrder = selectedCycle
    ? [selectedCycle, ...acknowledgementCycles.filter((cycle) => cycle.id !== selectedCycle.id)]
    : acknowledgementCycles;
  const blocking = cyclesInAcknowledgementOrder.map((cycle) => ({ cycle, status: statusByCycle.get(cycle.id) })).find(({ status }) => (
    status?.data && !status.data.acknowledged && !status.data.awaiting_documents
  ));
  const blockingCycle = blocking?.cycle ?? null;
  const blockingStatus = blocking?.status ?? null;
  const pending = blockingStatus?.data?.documents?.filter((document) => document.is_required && !document.acknowledgement) ?? [];

  useEffect(() => {
    setAgreedIds([]);
  }, [blockingCycle?.id]);

  const acknowledgeAll = useMutation({
    mutationFn: async () => Promise.all(pending.map((document) => api(`/cycle-documents/${blockingCycle.id}/${document.id}/acknowledgements`, { method: 'POST', body: { agree: true } }))),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['cycle-guideline-status'] });
      // Faculty supply their own changing cabin number. Take a newly onboarded
      // faculty member directly to that one-time profile step after guidelines.
      if (hasRole(user, 'faculty')) {
        const profile = await api('/research/my-mentor-profile');
        if (!profile.cabin) window.location.assign('/faculty/profile');
      }
    },
  });

  const agreedAll = pending.length > 0 && pending.every((document) => agreedIds.includes(document.id));
  if (isLoadingCycles || (shouldCheck && statusQueries.some((status) => status.isLoading))) return <div className="loading-state">Checking required cycle documents…</div>;
  // A missing document is not an acknowledgement failure. A new cycle can
  // legitimately have no required guidance yet, and treating that state as a
  // hard gate would lock newly enrolled people out of their workspace.
  // Only documents which CRCS has actually marked required can block access.
  const failedStatus = statusQueries.find((status) => status.isError);
  if (failedStatus) return <main className="grid min-h-screen place-items-center bg-slate-50 p-6"><Card className="max-w-xl p-6"><h1 className="text-xl font-bold text-slate-950">Documents could not be checked</h1><p className="mt-2 text-sm text-slate-600">Your dashboard stays unavailable until the required cycle documents can be verified.</p><Button className="mt-5" onClick={() => failedStatus.refetch()}>Try again</Button></Card></main>;
  if (!shouldCheck || !blockingCycle) return children;

  return <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:py-12"><Card className="mx-auto max-w-5xl border-indigo-200 p-5 shadow-xl sm:p-8"><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Cycle onboarding acknowledgement</p><h1 className="mt-2 text-2xl font-bold text-slate-950">Review {blockingCycle.name} guidelines</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">You have been added to this cycle. CRCS has shared {pending.length} required PDF{pending.length === 1 ? '' : 's'} for it. Review each document in the preview below, then scroll down to acknowledge it before continuing.</p>
    <div className="mt-6 space-y-3">{pending.map((document) => {
      const agreed = agreedIds.includes(document.id);
      return <article key={document.id} className="rounded-xl border border-slate-200 bg-white p-4"><div><h2 className="font-bold text-slate-900">{document.title}</h2><p className="mt-1 text-xs text-slate-500">{document.file_name} · Version {document.version}</p><p className="mt-3 text-sm text-slate-600">Read the document below, then scroll to its acknowledgement.</p></div><div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-100"><iframe title={`${document.title} preview`} src={documentPreviewUrl(document)} className="h-[70vh] min-h-[32rem] w-full bg-white" loading="lazy" /></div><label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700"><input type="checkbox" checked={agreed} onChange={(event) => setAgreedIds((ids) => event.target.checked ? [...ids, document.id] : ids.filter((id) => id !== document.id))} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" /><span>I understand this document and agree to follow it for this internship cycle.</span></label></article>;
    })}</div>
    {acknowledgeAll.isError && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">Could not save your agreement. Please try again.</p>}
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5"><p className="text-sm text-slate-500">{agreedIds.length} of {pending.length} agreements selected</p><Button onClick={() => acknowledgeAll.mutate()} disabled={!agreedAll || acknowledgeAll.isPending}>{acknowledgeAll.isPending ? 'Saving agreement…' : 'Agree and continue'}</Button></div>
  </Card></main>;
}
