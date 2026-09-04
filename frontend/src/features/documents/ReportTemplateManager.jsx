import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Button } from '../../components/ui/button.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Card } from '../../components/ui/card.jsx';
import { Select } from '../../components/ui/select.jsx';
import { Label } from '../../components/ui/label.jsx';

export default function ReportTemplateManager() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [track, setTrack] = useState('');
  const [schema, setSchema] = useState('');
  const [error, setError] = useState(null);

  const { data: templates, isLoading } = useQuery({
    queryKey: ['report-templates'],
    queryFn: () => api('/report-templates'),
  });

  const create = useMutation({
    mutationFn: (body) => api('/report-templates', { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['report-templates'] });
      setName('');
      setSchema('');
    },
    onError: (err) => setError(err.message),
  });

  function onSubmit(e) {
    e.preventDefault();
    setError(null);
    let parsedSchema;
    try {
      parsedSchema = schema ? JSON.parse(schema) : undefined;
    } catch {
      return setError('Schema must be valid JSON or left blank.');
    }
    create.mutate({ name, track: track || undefined, schema: parsedSchema });
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Card className="p-4">
        <h2 className="font-semibold mb-3">New Report Template</h2>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <Label>Track</Label>
            <Select value={track} onChange={(e) => setTrack(e.target.value)}>
              <option value="">Applies to all tracks</option>
              <option value="research">Research</option>
              <option value="crcs_opportunity">CRCS Opportunity</option>
              <option value="self_internship">Self-Internship</option>
            </Select>
          </div>
          <div>
            <Label>Schema (JSON, optional)</Label>
            <textarea
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm font-mono"
              rows={4}
              value={schema}
              onChange={(e) => setSchema(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={create.isPending}>Create Template</Button>
        </form>
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold mb-3">Existing Templates</h2>
        {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
        <ul className="space-y-2 text-sm">
          {templates?.map((t) => (
            <li key={t.id} className="border-b border-slate-100 pb-2">
              <span className="font-medium">{t.name}</span>
              <span className="text-slate-500"> — {t.track ?? 'all tracks'}{t.is_default ? ' (default)' : ''}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
