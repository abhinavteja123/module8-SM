import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { PencilSimple, GraduationCap } from '@phosphor-icons/react';
import { api } from '../../lib/api.js';
import { Button } from '../../components/ui/button.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Label } from '../../components/ui/label.jsx';
import { EmptyState, PageHeader } from '../../components/ui/page.jsx';
import { Skeleton } from '../../components/ui/skeleton.jsx';
import { Dialog } from '../../components/ui/dialog.jsx';
import UnlockRequestPanel from '../locks/UnlockRequestPanel.jsx';
import AttendanceBadge from '../../components/AttendanceBadge.jsx';
import { useCycle } from '../../cycles/CycleContext.jsx';

const trackFor = (mentee) => ({ research: 'research', opportunity: 'crcs_opportunity', self_internship: 'self_internship', opportunity_application: 'crcs_opportunity', research_application: 'research' }[mentee.type] ?? undefined);

function MarksEditor({ mentee, cycle, onClose }) {
  const [values, setValues] = useState({});
  const [status, setStatus] = useState(null);
  const queryClient = useQueryClient();
  const track = trackFor(mentee);
  const { data: savedMarks, isLoading } = useQuery({ queryKey: ['my-mentee-marks', mentee.student_id, cycle?.id, track], queryFn: () => api(`/marks/${mentee.student_id}?cycle_id=${cycle.id}${track ? `&track=${track}` : ''}`), enabled: Boolean(cycle?.id) });
  const requirements = savedMarks?.requirements ?? [];
  const assessedRequirements = requirements.filter((item) => Number(item.max_marks) > 0 && item.is_assessed !== false);
  useEffect(() => { setValues(Object.fromEntries(assessedRequirements.map((item) => [item.id, item.score == null ? '' : String(item.score)]))); }, [savedMarks, mentee.student_id]);
  const save = useMutation({
    mutationFn: () => api(`/marks/${mentee.student_id}`, { method: 'PUT', body: { cycle_id: cycle.id, track, component_scores: assessedRequirements.filter((item) => values[item.id] !== '').map((item) => ({ report_requirement_id: item.id, score: Number(values[item.id]) })) } }),
    onSuccess: (result) => { queryClient.setQueryData(['my-mentee-marks', mentee.student_id, cycle.id, track], result); setStatus(`Marks saved at ${new Date(result.updated_at).toLocaleString()}.`); },
    onError: (error) => setStatus(error.message),
  });
  const total = assessedRequirements.reduce((sum, item) => sum + (Number(values[item.id]) || 0), 0);
  const maximum = assessedRequirements.reduce((sum, item) => sum + Number(item.max_marks || 0), 0);
  return <Dialog open onClose={onClose} size="lg" title={<span className="flex items-center gap-2"><GraduationCap size={20} weight="light" className="text-brand-600" />Edit marks: {mentee.student?.full_name ?? 'Student'}</span>}><p className="-mt-3 mb-5 text-sm text-slate-600">{mentee.title ?? 'Allocated internship'} · {cycle?.name ?? 'Current cycle'}</p><form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>{isLoading && <p className="col-span-full text-sm text-slate-500">Loading assessment requirements…</p>}{!isLoading && !assessedRequirements.length && <p className="col-span-full rounded-lg bg-amber-50 p-4 text-sm text-amber-900">CRCS has not set any assessed report requirements for this internship path yet.</p>}{assessedRequirements.map((item) => <div key={item.id}><Label htmlFor={`marks-${item.id}`}>{item.title} <span className="font-normal text-slate-500">/ {item.max_marks}</span></Label><Input id={`marks-${item.id}`} className="mt-2" type="number" min="0" max={item.max_marks} step="0.01" value={values[item.id] ?? ''} onChange={(event) => setValues((current) => ({ ...current, [item.id]: event.target.value }))} /></div>)}<div className="col-span-full rounded-lg bg-indigo-50 px-4 py-3 text-right"><span className="text-sm font-medium text-indigo-800">Total</span><span className="ml-3 text-xl font-bold text-indigo-950">{total} / {maximum}</span></div><div className="col-span-full flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3"><span className="text-sm font-medium text-slate-700">Attendance</span><AttendanceBadge studentId={mentee.student_id} /></div>{status && <p className={`col-span-full text-sm ${save.isError ? 'text-red-700' : 'text-emerald-700'}`}>{status}</p>}<div className="col-span-full mt-2 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">Saving marks locks the student’s report uploads for this internship.</p><Button type="submit" disabled={!cycle?.id || !assessedRequirements.length || save.isPending || !Object.values(values).some((value) => value !== '')}>{save.isPending ? 'Saving…' : 'Save marks'}</Button></div></form></Dialog>;
}

export default function MarksEntryForm() {
  const [editingMentee, setEditingMentee] = useState(null);
  const { selectedCycle: cycle, selectedCycleId } = useCycle();
  const { data: allocationData, isLoading: allocationsLoading } = useQuery({ queryKey: ['mentor-allocations', selectedCycleId], queryFn: () => api(`/mentor-allocations?cycle_id=${selectedCycleId}`), enabled: !!selectedCycleId });
  const mentees = useMemo(() => [...new Map((allocationData?.mappings ?? []).map((mapping) => [mapping.student_id, mapping])).values()], [allocationData]);
  // A faculty member isn't allowed on the CRCS-only bulk /marks list endpoint;
  // fetch each of their own mentees' marks individually, same route MarksEditor already uses.
  const menteeMarksQueries = useQueries({ queries: mentees.map((mentee) => { const track = trackFor(mentee); return { queryKey: ['my-mentee-marks', mentee.student_id, selectedCycleId, track], queryFn: () => api(`/marks/${mentee.student_id}?cycle_id=${selectedCycleId}${track ? `&track=${track}` : ''}`), enabled: !!selectedCycleId }; }) });
  const marksLoading = menteeMarksQueries.some((query) => query.isLoading);
  const marksError = menteeMarksQueries.find((query) => query.error)?.error;
  const marksByStudent = useMemo(() => Object.fromEntries(mentees.map((mentee, index) => [mentee.student_id, menteeMarksQueries[index]?.data])), [mentees, menteeMarksQueries]);
  const allRequirements = useMemo(() => [...new Map(menteeMarksQueries.flatMap((query) => query.data?.requirements ?? []).filter((item) => Number(item.max_marks) > 0 && item.is_assessed !== false).map((item) => [item.id, item])).values()], [menteeMarksQueries]);
  const isLoading = allocationsLoading || marksLoading;
  if (!selectedCycleId) return <div className="max-w-3xl"><PageHeader eyebrow="Assessment" title="No open cycle yet" description="Marks can be recorded after CRCS publishes a cycle and assigns students to you." /></div>;
  return <div className="max-w-7xl space-y-6"><PageHeader breadcrumb={[{ label: 'Home' }, { label: 'Faculty' }, { label: 'Award marks' }]} eyebrow={`Assessment · ${cycle?.name ?? 'Selected cycle'}`} title="Award student marks" description="The score fields below are configured by CRCS report requirements and maximum marks." /><UnlockRequestPanel />{isLoading && <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>}{marksError && <p className="inline-notice border-red-200 bg-red-50 text-red-700">Marks could not be loaded. {marksError.message}</p>}{!isLoading && !mentees.length && <EmptyState title="No allocated students available for marks" description="Marks can be recorded after CRCS assigns a student to you." />}{!isLoading && mentees.length > 0 && <div className="rounded-none border border-ink/15 bg-white"><div className="border-b border-ink/15 bg-slate-50 px-5 py-4"><p className="font-semibold text-ink">Allocated students</p><p className="mt-1 text-sm text-slate-600">{mentees.length} student{mentees.length === 1 ? '' : 's'} · {cycle?.name ?? 'Current cycle'}</p></div><div className="overflow-x-auto"><table className="data-grid min-w-[760px]"><thead><tr><th>Student &amp; internship</th>{allRequirements.map((item) => <th key={item.id} className="text-center">{item.title}<br />/ {item.max_marks}</th>)}<th className="text-center">Total</th><th className="text-center">Attendance</th><th className="text-right">Action</th></tr></thead><tbody>{mentees.map((mentee) => { const marks = marksByStudent[mentee.student_id]; const scores = new Map((marks?.requirements ?? []).map((item) => [item.id, item.score])); return <tr key={mentee.student_id}><td><p className="font-semibold text-ink">{mentee.student?.full_name ?? 'Student'}</p><p className="text-xs text-slate-500">{mentee.student?.email}</p><p className="mt-1 text-xs font-medium text-brand-700">{mentee.title ?? 'Allocated internship'}</p></td>{allRequirements.map((item) => <td key={item.id} className="num text-center">{scores.get(item.id) ?? '—'}</td>)}<td className="num text-center font-bold text-brand-700">{marks ? `${marks.total} / ${marks.maximum}` : '—'}</td><td className="text-center"><AttendanceBadge studentId={mentee.student_id} cycleId={selectedCycleId} /></td><td className="text-right"><Button type="button" variant="secondary" className="inline-flex items-center gap-1.5" onClick={() => setEditingMentee(mentee)}><PencilSimple size={13} weight="bold" />{marks?.total ? 'Edit' : 'Enter marks'}</Button></td></tr>; })}</tbody></table></div></div>}{editingMentee && <MarksEditor mentee={editingMentee} cycle={cycle} onClose={() => setEditingMentee(null)} />}</div>;
}
