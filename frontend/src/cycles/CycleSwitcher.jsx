import { useCycle } from './CycleContext.jsx';

export function CycleSwitcher() {
  const { cycles, selectedCycle, selectCycle, isLoading } = useCycle();
  if (isLoading) return <span className="text-xs text-slate-500">Loading cycles…</span>;
  if (!cycles.length) return <span className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">No open cycle yet</span>;
  return <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"><span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Cycle</span><select aria-label="Selected internship cycle" className="max-w-48 bg-transparent text-sm font-semibold text-slate-900 outline-none" value={selectedCycle?.id ?? ''} onChange={(event) => selectCycle(event.target.value)}>{cycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.name} · {cycle.status === 'not_started' ? 'Draft' : cycle.status === 'closed' ? 'Closed' : 'Open'}</option>)}</select></label>;
}
