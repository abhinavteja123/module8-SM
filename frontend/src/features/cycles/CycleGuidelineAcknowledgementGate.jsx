import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useCycle } from '../../cycles/CycleContext.jsx';
import { hasRole } from '../../lib/permissions.js';
import { Button } from '../../components/ui/button.jsx';
import { Card } from '../../components/ui/card.jsx';

export function CycleGuidelineAcknowledgementGate({ children }) {
  const { user } = useAuth();
  const { selectedCycle, selectedCycleId, isLoading: isLoadingCycles } = useCycle();
  const queryClient = useQueryClient();
  const [agreedIds, setAgreedIds] = useState([]);
  const [skippedIds, setSkippedIds] = useState([]);
  // The Superadmin owns document upload and replacement. Every other role,
  // including CRCS Coordinators and oversight users, must wait for and agree
  // to the cycle's required documents before opening a dashboard.
  const shouldCheck = Boolean(user && !hasRole(user, 'crcs_superadmin') && selectedCycleId && selectedCycle?.status === 'open');
  const status = useQuery({
    queryKey: ['cycle-guideline-status', selectedCycleId, user?.id],
    queryFn: () => api(`/cycle-documents/${selectedCycleId}/status`),
    enabled: shouldCheck,
    staleTime: 15_000,
  });
  const pending = status.data?.documents?.filter((document) => document.is_required && !document.acknowledgement) ?? [];

  useEffect(() => {
    setAgreedIds([]);
    setSkippedIds([]);
  }, [selectedCycleId]);

  const acknowledgeAll = useMutation({
    mutationFn: async () => Promise.all(pending.map((document) => api(`/cycle-documents/${selectedCycleId}/${document.id}/acknowledgements`, { method: 'POST', body: { agree: true } }))),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cycle-guideline-status', selectedCycleId] }),
  });

  const agreedAll = pending.length > 0 && pending.every((document) => agreedIds.includes(document.id));
  if (isLoadingCycles || (shouldCheck && status.isLoading)) return <div className="loading-state">Checking required cycle documents…</div>;
  // A missing document is not an acknowledgement failure.  A newly opened
  // cycle can legitimately have no required guidance yet, and treating that
  // state as a hard gate locks every non-superadmin out of their workspace.
  // Only documents which CRCS has actually marked required can block access.
  if (!shouldCheck || status.data?.acknowledged || status.data?.awaiting_documents) return children;
  if (status.isError) return <main className="grid min-h-screen place-items-center bg-slate-50 p-6"><Card className="max-w-xl p-6"><h1 className="text-xl font-bold text-slate-950">Documents could not be checked</h1><p className="mt-2 text-sm text-slate-600">Your dashboard stays unavailable until the required cycle documents can be verified.</p><Button className="mt-5" onClick={() => status.refetch()}>Try again</Button></Card></main>;

  return <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:py-12"><Card className="mx-auto max-w-3xl border-indigo-200 p-5 shadow-xl sm:p-8"><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Required before dashboard access</p><h1 className="mt-2 text-2xl font-bold text-slate-950">Review {selectedCycle?.name} guidelines</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">CRCS has shared {pending.length} required PDF{pending.length === 1 ? '' : 's'} for this cycle. You may skip opening a file, but you must explicitly agree to every document before continuing.</p>
    <div className="mt-6 space-y-3">{pending.map((document) => {
      const agreed = agreedIds.includes(document.id);
      const skipped = skippedIds.includes(document.id);
      return <article key={document.id} className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold text-slate-900">{document.title}</h2><p className="mt-1 text-xs text-slate-500">{document.file_name} · Version {document.version}</p></div><div className="flex gap-2"><a href={document.url} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-lg bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100">Open PDF</a><Button type="button" variant="ghost" className="px-3 py-2" onClick={() => setSkippedIds((ids) => ids.includes(document.id) ? ids : [...ids, document.id])}>{skipped ? 'Reading skipped' : 'Skip reading'}</Button></div></div><label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700"><input type="checkbox" checked={agreed} onChange={(event) => setAgreedIds((ids) => event.target.checked ? [...ids, document.id] : ids.filter((id) => id !== document.id))} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" /><span>I understand this document and agree to follow it for this internship cycle.</span></label></article>;
    })}</div>
    {acknowledgeAll.isError && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">Could not save your agreement. Please try again.</p>}
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5"><p className="text-sm text-slate-500">{agreedIds.length} of {pending.length} agreements selected</p><Button onClick={() => acknowledgeAll.mutate()} disabled={!agreedAll || acknowledgeAll.isPending}>{acknowledgeAll.isPending ? 'Saving agreement…' : 'Agree and open dashboard'}</Button></div>
  </Card></main>;
}
