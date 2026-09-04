import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Button } from '../../components/ui/button.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Card } from '../../components/ui/card.jsx';
import { Label } from '../../components/ui/label.jsx';

const FIELDS = [
  ['weekly_report_score', 'Weekly Report'],
  ['mid_marks', 'Mid Marks'],
  ['synopsis_marks', 'Synopsis'],
  ['thesis_marks', 'Thesis'],
  ['ppt_marks', 'PPT'],
  ['viva_marks', 'Viva'],
];

export default function MarksEntryForm() {
  const [studentId, setStudentId] = useState('');
  const [cycleId, setCycleId] = useState('');
  const [values, setValues] = useState({});
  const [status, setStatus] = useState(null);

  const submit = useMutation({
    mutationFn: () => {
      const body = { cycle_id: cycleId };
      for (const [key] of FIELDS) if (values[key] !== undefined && values[key] !== '') body[key] = Number(values[key]);
      return api(`/marks/${studentId}`, { method: 'PUT', body });
    },
    onSuccess: () => setStatus('Saved.'),
    onError: (err) => setStatus(err.message),
  });

  return (
    <Card className="p-4 max-w-md">
      <h2 className="font-semibold mb-3">Enter Marks</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate();
        }}
        className="space-y-3"
      >
        <div>
          <Label>Student ID</Label>
          <Input value={studentId} onChange={(e) => setStudentId(e.target.value)} required />
        </div>
        <div>
          <Label>Cycle ID</Label>
          <Input value={cycleId} onChange={(e) => setCycleId(e.target.value)} required />
        </div>
        {FIELDS.map(([key, label]) => (
          <div key={key}>
            <Label>{label}</Label>
            <Input
              type="number"
              step="0.01"
              value={values[key] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
            />
          </div>
        ))}
        {status && <p className="text-sm text-slate-600">{status}</p>}
        <Button type="submit" disabled={submit.isPending}>Save Marks</Button>
      </form>
    </Card>
  );
}
