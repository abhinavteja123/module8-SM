import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Button } from '../../components/ui/button.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Card } from '../../components/ui/card.jsx';
import { Select } from '../../components/ui/select.jsx';
import { Label } from '../../components/ui/label.jsx';

const FIELDS = [
  ['weekly_report_score', 'Weekly Report'],
  ['mid_marks', 'Mid Marks'],
  ['synopsis_marks', 'Synopsis'],
  ['thesis_marks', 'Thesis'],
  ['ppt_marks', 'PPT'],
  ['viva_marks', 'Viva'],
];

export default function MarksOverridePanel() {
  const [studentId, setStudentId] = useState('');
  const [cycleId, setCycleId] = useState('');
  const [fieldName, setFieldName] = useState(FIELDS[0][0]);
  const [newValue, setNewValue] = useState('');
  const [status, setStatus] = useState(null);

  const submit = useMutation({
    mutationFn: () =>
      api(`/marks/${studentId}/override`, {
        method: 'PATCH',
        body: { cycle_id: cycleId, field_name: fieldName, new_value: Number(newValue) },
      }),
    onSuccess: () => setStatus('Override applied.'),
    onError: (err) => setStatus(err.message),
  });

  return (
    <Card className="p-4 max-w-md">
      <h2 className="font-semibold mb-3">Marks Override</h2>
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
        <div>
          <Label>Field</Label>
          <Select value={fieldName} onChange={(e) => setFieldName(e.target.value)}>
            {FIELDS.map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label>New Value</Label>
          <Input type="number" step="0.01" value={newValue} onChange={(e) => setNewValue(e.target.value)} required />
        </div>
        {status && <p className="text-sm text-slate-600">{status}</p>}
        <Button type="submit" disabled={submit.isPending}>Apply Override</Button>
      </form>
    </Card>
  );
}
