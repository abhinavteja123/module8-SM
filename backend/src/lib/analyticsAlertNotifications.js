import { supabase, unwrap } from '../db/client.js';
import { notify } from './notifications.js';

const ALERT_COPY = {
  overdue_reports: (count) => ({ title: `${count} overdue report${count === 1 ? '' : 's'} need attention`, body: 'Open Analytics to review the affected students and deadlines.' }),
  capacity_risk: (count) => ({ title: `${count} mentor capacity risk${count === 1 ? '' : 's'} detected`, body: 'Open Analytics to review fully allocated research mentors.' }),
  pending_reviews: (count) => ({ title: `${count} application review${count === 1 ? '' : 's'} waiting`, body: 'Open Analytics to review pending faculty and CRCS decisions.' }),
};

async function deliveryIsNew({ cycleId, alertKey, recipientId, observedCount }) {
  const result = await supabase.from('analytics_alert_deliveries').insert({
    cycle_id: cycleId,
    alert_key: alertKey,
    recipient_id: recipientId,
    observed_count: observedCount,
  }).select('id').maybeSingle();
  if (!result.error) return Boolean(result.data);
  // A same-day notification already exists. This is expected, not a failure.
  if (result.error.code === '23505') return false;
  throw result.error;
}

export async function sendAnalyticsAlertNotifications() {
  // Both queries must be scoped per-university below — a cycle's alerts
  // belong only to that cycle's own CRCS Superadmins, not every superadmin
  // system-wide (a real cross-tenant leak this fixed: an admin was getting
  // "12 application reviews waiting" alerts for a different university's
  // cycle entirely).
  const cyclesResult = await supabase.from('internship_cycles').select('id,name,university_id').eq('status', 'open');
  if (cyclesResult.error && /analytics_alert_deliveries|analytics_cycle_overview/i.test(cyclesResult.error.message)) return;
  const cycles = unwrap(cyclesResult);
  if (!cycles.length) return;
  const admins = unwrap(await supabase.from('user_roles').select('user_id, users!inner(university_id)').eq('role', 'crcs_superadmin'));
  const recipientsByUniversity = new Map();
  for (const admin of admins) {
    const universityId = admin.users?.university_id;
    if (!universityId) continue;
    if (!recipientsByUniversity.has(universityId)) recipientsByUniversity.set(universityId, new Set());
    recipientsByUniversity.get(universityId).add(admin.user_id);
  }
  if (!recipientsByUniversity.size) return;

  for (const cycle of cycles) {
    const recipients = [...(recipientsByUniversity.get(cycle.university_id) ?? [])];
    if (!recipients.length) continue;
    const overviewResult = await supabase.rpc('analytics_cycle_overview', {
      p_cycle_id: cycle.id, p_department_ids: null, p_school_ids: null, p_faculty_id: null, p_is_system: true,
    });
    if (overviewResult.error && /analytics_cycle_overview/i.test(overviewResult.error.message)) return;
    const alerts = unwrap(overviewResult).alerts ?? [];
    for (const alert of alerts) {
      const count = Number(alert.count ?? 0);
      const makeCopy = ALERT_COPY[alert.key];
      if (!makeCopy || count <= 0) continue;
      for (const recipientId of recipients) {
        if (!(await deliveryIsNew({ cycleId: cycle.id, alertKey: alert.key, recipientId, observedCount: count }))) continue;
        const copy = makeCopy(count);
        // relatedEntityType is the alert's own key (capacity_risk/pending_reviews/
        // overdue_reports) so the notification bell can route to the actual
        // page CRCS acts on, not a generic analytics landing page.
        await notify({ userId: recipientId, title: copy.title, body: `${cycle.name}: ${copy.body}`, relatedEntityType: alert.key, relatedEntityId: cycle.id });
      }
    }
  }
}

export function startAnalyticsAlertNotifications() {
  sendAnalyticsAlertNotifications().catch((error) => console.error('[analytics alerts] notification sweep failed:', error.message));
  setInterval(() => {
    sendAnalyticsAlertNotifications().catch((error) => console.error('[analytics alerts] notification sweep failed:', error.message));
  }, 60 * 60 * 1000).unref();
}
