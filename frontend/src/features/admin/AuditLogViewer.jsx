import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Button } from '../../components/ui/button.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Card } from '../../components/ui/card.jsx';
import { Label } from '../../components/ui/label.jsx';

export default function AuditLogViewer() {
  const [entityType, setEntityType] = useState('');
  const [entityId, setEntityId] = useState('');
  const [filters, setFilters] = useState({ entityType: '', entityId: '' });

  const { data: rows, isLoading } = useQuery({
    queryKey: ['audit-log', filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.entityType) params.set('entity_type', filters.entityType);
      if (filters.entityId) params.set('entity_id', filters.entityId);
      return api(`/audit-log?${params.toString()}`);
    },
  });

  return (
    <div className="space-y-4">
      <Card className="p-4 flex gap-3 items-end max-w-xl">
        <div>
          <Label>Entity Type</Label>
          <Input value={entityType} onChange={(e) => setEntityType(e.target.value)} placeholder="research_applications" />
        </div>
        <div>
          <Label>Entity ID</Label>
          <Input value={entityId} onChange={(e) => setEntityId(e.target.value)} />
        </div>
        <Button onClick={() => setFilters({ entityType, entityId })}>Filter</Button>
      </Card>

      <Card className="p-4 overflow-auto">
        {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="py-1 pr-3">Role</th>
              <th className="py-1 pr-3">Action</th>
              <th className="py-1 pr-3">Entity</th>
              <th className="py-1 pr-3">Old → New</th>
              <th className="py-1 pr-3">When</th>
            </tr>
          </thead>
          <tbody>
            {rows?.map((r) => (
              <tr key={r.id} className="border-b border-slate-100">
                <td className="py-1 pr-3">{r.actor_role}</td>
                <td className="py-1 pr-3">{r.action}</td>
                <td className="py-1 pr-3">{r.entity_type}/{r.entity_id}</td>
                <td className="py-1 pr-3 max-w-xs truncate" title={`${JSON.stringify(r.old_value)} → ${JSON.stringify(r.new_value)}`}>
                  {JSON.stringify(r.old_value)} → {JSON.stringify(r.new_value)}
                </td>
                <td className="py-1 pr-3">{new Date(r.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows && !rows.length && <p className="text-sm text-slate-500">No audit entries.</p>}
      </Card>
    </div>
  );
}
