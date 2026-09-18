import { IdentificationCard } from '@phosphor-icons/react';
import { Dialog } from '../../components/ui/dialog.jsx';

export default function StudentDetailsModal({ student, onClose }) {
  if (!student) return null;
  const detail = (label, value) => (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-ink">{value ?? 'Not provided'}</p>
    </div>
  );
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          <IdentificationCard size={20} weight="light" className="text-brand-600" />
          {student.full_name}
        </span>
      }
    >
      <p className="-mt-3 mb-5 text-sm text-slate-600">{student.email}</p>
      <div className="grid gap-5 rounded-2xl bg-slate-50 p-5 sm:grid-cols-2">
        {detail('Roll number', student.roll_number)}
        {detail('Phone', student.phone)}
        {detail('Department', student.department?.name)}
        {detail('School', student.department?.school?.name)}
        {detail('Batch', student.batch_year)}
        {detail('CGPA', student.cgpa)}
      </div>
    </Dialog>
  );
}
