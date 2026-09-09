import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Button } from '../../components/ui/button.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Card } from '../../components/ui/card.jsx';
import { Label } from '../../components/ui/label.jsx';
import { EmptyState, PageHeader } from '../../components/ui/page.jsx';
import UnlockRequestPanel from '../locks/UnlockRequestPanel.jsx';

const FIELDS = [
  ['weekly_report_score', 'Weekly report'],
  ['mid_marks', 'Mid marks'],
  ['synopsis_marks', 'Synopsis'],
  ['thesis_marks', 'Thesis'],
  ['ppt_marks', 'PPT'],
  ['viva_marks', 'Viva'],
];

const totalFor = (marks) => FIELDS.reduce((total, [key]) => total + (Number(marks?.[key]) || 0), 0);

function MarksEditor({ mentee, cycle, onClose }) {
  const [values, setValues] = useState({});
  const [status, setStatus] = useState(null);
  const queryClient = useQueryClient();
  const { data: savedMarks, isLoading } = useQuery({
    queryKey: ['my-mentee-marks', mentee.student_id, cycle?.id],
    queryFn: () => api(`/marks/${mentee.student_id}?cycle_id=${cycle.id}`),
    enabled: Boolean(cycle?.id),
  });
  useEffect(() => {
    const restored = {};
    for (const [key] of FIELDS) if (savedMarks?.[key] != null) restored[key] = String(savedMarks[key]);
    setValues(restored);
  }, [savedMarks, mentee.student_id]);
  const save = useMutation({
    mutationFn: () => {
      const body = { cycle_id: cycle.id };
      for (const [key] of FIELDS) if (values[key] !== undefined && values[key] !== '') body[key] = Number(values[key]);
      return api(`/marks/${mentee.student_id}`, { method: 'PUT', body });
    },
    onSuccess: (result) => {
      queryClient.setQueryData(['my-mentee-marks', mentee.student_id, cycle.id], result);
      queryClient.invalidateQueries({ queryKey: ['marks-grid', cycle.id] });
      setStatus(`Marks saved at ${new Date(result.updated_at).toLocaleString()}.`);
    },
    onError: (error) => setStatus(error.message),
  });
  const total = totalFor(values);

  return <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <Card role="dialog" aria-modal="true" aria-label="Edit student marks" className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto border-indigo-200 bg-white p-6 shadow-2xl">
      <div className="flex items-start justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Mark allocation</p><h2 className="mt-1 text-xl font-bold text-slate-950">Edit marks: {mentee.student?.full_name ?? 'Student'}</h2><p className="mt-1 text-sm text-slate-600">{mentee.title ?? 'Allocated internship'} · {cycle?.name ?? 'Current cycle'}</p></div>
        <Button type="button" variant="ghost" className="px-3 py-2" onClick={onClose}>Close</Button>
      </div>
      <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
        {isLoading && <p className="col-span-full text-sm text-slate-500">Loading saved marks…</p>}
        {FIELDS.map(([key, label]) => <div key={key}><Label htmlFor={`marks-${key}`}>{label}</Label><Input id={`marks-${key}`} className="mt-2" type="number" min="0" step="0.01" value={values[key] ?? ''} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} /></div>)}
        <div className="col-span-full rounded-lg bg-indigo-50 px-4 py-3 text-right"><span className="text-sm font-medium text-indigo-800">Total</span><span className="ml-3 text-xl font-bold text-indigo-950">{total}</span></div>
        {status && <p className={`col-span-full text-sm ${save.isError ? 'text-red-700' : 'text-emerald-700'}`}>{status}</p>}
        <div className="col-span-full mt-2 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">Once marks are saved, the student can no longer edit report submissions.</p><Button type="submit" disabled={!cycle?.id || save.isPending || !Object.values(values).some((value) => value !== '')}>{save.isPending ? 'Saving…' : 'Save marks'}</Button></div>
      </form>
    </Card>
  </div>;
}

export default function MarksEntryForm() {
  const [editingMentee, setEditingMentee] = useState(null);
  const { data: cycle, isLoading: cycleLoading } = useQuery({ queryKey: ['cycle-current'], queryFn: () => api('/cycles/current'), retry: false });
  const { data: allocationData, isLoading: allocationsLoading } = useQuery({ queryKey: ['mentor-allocations'], queryFn: () => api('/mentor-allocations') });
  const mentees = useMemo(() => [...new Map((allocationData?.mappings ?? []).map((mapping) => [mapping.student_id, mapping])).values()], [allocationData]);
  const markQueries = useQueries({ queries: mentees.map((mentee) => ({ queryKey: ['marks-grid', cycle?.id, mentee.student_id], queryFn: () => api(`/marks/${mentee.student_id}?cycle_id=${cycle.id}`), enabled: Boolean(cycle?.id) })) });
  const marksByStudent = useMemo(() => Object.fromEntries(mentees.map((mentee, index) => [mentee.student_id, markQueries[index]?.data])), [mentees, markQueries]);
  const isLoading = cycleLoading || allocationsLoading || markQueries.some((query) => query.isLoading);

  return <div className="max-w-7xl space-y-6">
    <PageHeader eyebrow="Assessment" title="Award student marks" description="All students assigned to you are shown in one grid. Select Edit on a row to enter or update that student’s marks." />
    <UnlockRequestPanel />
    {isLoading && <p className="loading-state">Loading allocated students and saved marks…</p>}
    {!isLoading && !mentees.length && <EmptyState title="No allocated students available for marks" description="Marks can be recorded after CRCS assigns a student to you." />}
    {!isLoading && mentees.length > 0 && <Card className="overflow-hidden">
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-4"><p className="font-semibold text-slate-900">Allocated students</p><p className="mt-1 text-sm text-slate-600">{mentees.length} student{mentees.length === 1 ? '' : 's'} · {cycle?.name ?? 'Current cycle'}</p></div>
      <div className="overflow-x-auto"><table className="min-w-[1130px] w-full text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-4">Student & internship</th>{FIELDS.map(([, label]) => <th key={label} className="px-3 py-4 text-center">{label}</th>)}<th className="px-3 py-4 text-center">Total</th><th className="px-5 py-4 text-right">Action</th></tr></thead><tbody>{mentees.map((mentee) => { const marks = marksByStudent[mentee.student_id]; return <tr key={mentee.student_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50"><td className="px-5 py-4"><p className="font-semibold text-slate-900">{mentee.student?.full_name ?? 'Student'}</p><p className="text-xs text-slate-500">{mentee.student?.email}</p><p className="mt-1 text-xs font-medium text-indigo-700">{mentee.title ?? 'Allocated internship'}</p></td>{FIELDS.map(([key]) => <td key={key} className="px-3 py-4 text-center font-semibold text-slate-700">{marks?.[key] ?? '—'}</td>)}<td className="px-3 py-4 text-center font-bold text-indigo-700">{marks ? totalFor(marks) : '—'}</td><td className="px-5 py-4 text-right"><Button type="button" variant="secondary" onClick={() => setEditingMentee(mentee)}>{marks ? 'Edit' : 'Enter marks'}</Button></td></tr>; })}</tbody></table></div>
    </Card>}
    {editingMentee && <MarksEditor mentee={editingMentee} cycle={cycle} onClose={() => setEditingMentee(null)} />}
  </div>;
}
