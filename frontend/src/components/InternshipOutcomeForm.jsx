import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { Button } from './ui/button.jsx';
import { Input } from './ui/input.jsx';
import { Label } from './ui/label.jsx';
import { Select } from './ui/select.jsx';

const EMPTY = { mode: '', duration_months: '', nature: '', stipend_amount: '', company_country: '', domain_sector: '' };

// Analytics-only internship outcome details (mode/paid-unpaid/stipend/country/domain).
// Intentionally not part of the student's profile — see backend/db/migrations
// for why this is a separate table nothing else reads.
export function InternshipOutcomeForm({ sourceType, sourceId }) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState(EMPTY);
  const { data: existing } = useQuery({
    queryKey: ['internship-outcome', sourceType, sourceId],
    queryFn: () => api(`/internship-outcomes/mine?source_type=${sourceType}&source_id=${sourceId}`),
  });
  useEffect(() => {
    if (existing) setValues({
      mode: existing.mode ?? '', duration_months: existing.duration_months ?? '', nature: existing.nature ?? '',
      stipend_amount: existing.stipend_amount ?? '', company_country: existing.company_country ?? '', domain_sector: existing.domain_sector ?? '',
    });
  }, [existing]);

  const save = useMutation({
    mutationFn: () => api('/internship-outcomes', {
      method: 'POST',
      body: {
        source_type: sourceType, source_id: sourceId,
        mode: values.mode || undefined, nature: values.nature,
        duration_months: values.duration_months === '' ? undefined : Number(values.duration_months),
        stipend_amount: values.stipend_amount === '' ? undefined : Number(values.stipend_amount),
        company_country: values.company_country || undefined, domain_sector: values.domain_sector || undefined,
      },
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['internship-outcome', sourceType, sourceId] }),
  });

  return (
    <form className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
      <p className="col-span-full text-sm font-semibold text-slate-800">Internship outcome details</p>
      <p className="col-span-full -mt-2 text-xs text-slate-500">Used for department-wise placement reporting only — not shown on your profile.</p>
      <div>
        <Label>Paid or unpaid</Label>
        <Select value={values.nature} onChange={(event) => setValues((v) => ({ ...v, nature: event.target.value }))} required>
          <option value="">Select</option>
          <option value="paid">Paid</option>
          <option value="unpaid">Unpaid</option>
        </Select>
      </div>
      <div>
        <Label>Mode</Label>
        <Select value={values.mode} onChange={(event) => setValues((v) => ({ ...v, mode: event.target.value }))}>
          <option value="">Select</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
        </Select>
      </div>
      {values.nature === 'paid' && (
        <div><Label>Stipend (₹ per month)</Label><Input type="number" min="0" value={values.stipend_amount} onChange={(event) => setValues((v) => ({ ...v, stipend_amount: event.target.value }))} /></div>
      )}
      <div><Label>Duration (months)</Label><Input type="number" min="0" step="0.5" value={values.duration_months} onChange={(event) => setValues((v) => ({ ...v, duration_months: event.target.value }))} /></div>
      <div><Label>Company country</Label><Input value={values.company_country} onChange={(event) => setValues((v) => ({ ...v, company_country: event.target.value }))} placeholder="e.g. India" /></div>
      <div><Label>Domain / sector</Label><Input value={values.domain_sector} onChange={(event) => setValues((v) => ({ ...v, domain_sector: event.target.value }))} placeholder="e.g. Software & IT Services" /></div>
      {save.error && <p className="col-span-full text-sm text-red-600">{save.error.message}</p>}
      <div className="col-span-full">
        <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : existing ? 'Update outcome details' : 'Save outcome details'}</Button>
        {save.isSuccess && !save.isPending && <span className="ml-3 text-sm text-emerald-700">Saved.</span>}
      </div>
    </form>
  );
}
