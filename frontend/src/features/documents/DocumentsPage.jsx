import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Card } from '../../components/ui/card.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Select } from '../../components/ui/select.jsx';
import { Label } from '../../components/ui/label.jsx';

export default function DocumentsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [file, setFile] = useState(null);
  const [relatedEntityType, setRelatedEntityType] = useState('research_application');
  const [relatedEntityId, setRelatedEntityId] = useState('');
  const [weekNumber, setWeekNumber] = useState('');
  const [reportTemplateId, setReportTemplateId] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const { data: docs, isLoading } = useQuery({
    queryKey: ['documents', user.id],
    queryFn: () => api(`/documents?student_id=${user.id}`),
  });

  async function onSubmit(e) {
    e.preventDefault();
    if (!file) return setError('Choose a file first.');
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('related_entity_type', relatedEntityType);
      fd.append('related_entity_id', relatedEntityId);
      if (weekNumber) fd.append('week_number', weekNumber);
      if (reportTemplateId) fd.append('report_template_id', reportTemplateId);
      await api('/documents/upload', { method: 'POST', body: fd, isFormData: true });
      qc.invalidateQueries({ queryKey: ['documents', user.id] });
      setFile(null);
      setRelatedEntityId('');
      setWeekNumber('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Card className="p-4">
        <h2 className="font-semibold mb-3">Upload Document</h2>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label>File</Label>
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <div>
            <Label>Related to</Label>
            <Select value={relatedEntityType} onChange={(e) => setRelatedEntityType(e.target.value)}>
              <option value="research_application">Research Application</option>
              <option value="self_internship">Self-Internship</option>
              <option value="opportunity_application">Opportunity Application</option>
            </Select>
          </div>
          <div>
            <Label>Related entity ID</Label>
            <Input value={relatedEntityId} onChange={(e) => setRelatedEntityId(e.target.value)} required />
          </div>
          <div>
            <Label>Week number (weekly reports only)</Label>
            <Input type="number" value={weekNumber} onChange={(e) => setWeekNumber(e.target.value)} />
          </div>
          <div>
            <Label>Report template ID (optional)</Label>
            <Input value={reportTemplateId} onChange={(e) => setReportTemplateId(e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={busy}>{busy ? 'Uploading…' : 'Upload'}</Button>
        </form>
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold mb-3">My Documents</h2>
        {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
        <ul className="space-y-2">
          {docs?.map((d) => (
            <li key={d.id} className="flex items-center justify-between text-sm border-b border-slate-100 pb-2">
              <span>{d.file_name}</span>
              <div className="flex items-center gap-2">
                <Badge status={d.review_status}>{d.review_status}</Badge>
                {d.url && <a className="text-blue-600 underline" href={d.url} target="_blank" rel="noreferrer">view</a>}
              </div>
            </li>
          ))}
          {!isLoading && !docs?.length && <p className="text-sm text-slate-500">No documents yet.</p>}
        </ul>
      </Card>
    </div>
  );
}
