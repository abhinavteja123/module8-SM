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
  const cyclesResult = await supabase.from('internship_cycles').select('id,name').eq('status', 'open');
  if (cyclesResult.error && /analytics_alert_deliveries|analytics_cycle_overview/i.test(cyclesResult.error.message)) return;
  const cycles = unwrap(cyclesResult);
  if (!cycles.length) return;
  const admins = unwrap(await supabase.from('user_roles').select('user_id').eq('role', 'crcs_superadmin'));
  const recipients = [...new Set(admins.map((admin) => admin.user_id))];
  if (!recipients.length) return;

  for (const cycle of cycles) {
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
        await notify({ userId: recipientId, title: copy.title, body: `${cycle.name}: ${copy.body}`, relatedEntityType: 'internship_cycle', relatedEntityId: cycle.id });
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
