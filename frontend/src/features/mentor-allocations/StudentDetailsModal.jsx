import { Card } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';

export default function StudentDetailsModal({ student, onClose }) {
  if (!student) return null;
  const detail = (label, value) => <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-sm font-medium text-slate-900">{value ?? 'Not provided'}</p></div>;
  return <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><Card role="dialog" aria-modal="true" aria-label="Student details" className="w-full max-w-2xl border-indigo-200 bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Allocated student</p><h2 className="mt-1 text-xl font-bold text-slate-950">{student.full_name}</h2><p className="mt-1 text-sm text-slate-600">{student.email}</p></div><Button type="button" variant="ghost" className="px-3 py-2" onClick={onClose}>Close</Button></div><div className="mt-6 grid gap-5 rounded-xl bg-slate-50 p-5 sm:grid-cols-2">{detail('Roll number', student.roll_number)}{detail('Phone', student.phone)}{detail('Department', student.department?.name)}{detail('School', student.department?.school?.name)}{detail('Batch', student.batch_year)}{detail('CGPA', student.cgpa)}</div></Card></div>;
}
