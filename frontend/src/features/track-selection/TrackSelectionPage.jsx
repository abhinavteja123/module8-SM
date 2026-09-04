import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Card } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Select } from '../../components/ui/select.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Label } from '../../components/ui/label.jsx';

const TRACKS = [
  { value: 'research', label: 'Research Internship' },
  { value: 'crcs_opportunity', label: 'Opportunity by CRCS' },
  { value: 'self_internship', label: 'Self-Internship' },
];

export default function TrackSelectionPage() {
  const { data: cycle, isLoading, error: cycleError } = useQuery({
    queryKey: ['cycle-current'],
    queryFn: () => api('/cycles/current'),
    retry: false,
  });
  const [track, setTrack] = useState('research');
  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api('/students/me/track-selection', {
        method: 'POST',
        body: { cycle_id: cycle.id, track, questionnaire_response: { category, notes } },
      }),
  });

  if (isLoading) return <p>Loading…</p>;
  if (cycleError) return <p className="text-red-600">No open internship cycle right now.</p>;

  return (
    <Card className="max-w-lg p-6">
      <h1 className="text-lg font-semibold mb-1">{cycle.name}</h1>
      <p className="text-sm text-slate-500 mb-4">Select your internship track for this cycle.</p>

      <div className="space-y-3">
        <div>
          <Label>Track</Label>
          <Select value={track} onChange={(e) => setTrack(e.target.value)}>
            {TRACKS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Reservation category (optional)</Label>
          <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. General, OBC, SC/ST" />
        </div>
        <div>
          <Label>Notes (optional)</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything else CRCS should know" />
        </div>
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? 'Submitting…' : 'Confirm Selection'}
        </Button>
        {mutation.isSuccess && <p className="text-sm text-green-700">Track selected.</p>}
        {mutation.isError && <p className="text-sm text-red-600">{mutation.error.message}</p>}
      </div>
    </Card>
  );
}
