import { supabase, unwrap } from '../db/client.js';
import { notify } from './notifications.js';

const REMINDER_WINDOW_MS = 48 * 60 * 60 * 1000;

export async function sendUpcomingReportDeadlineReminders() {
  const now = new Date();
  const dueBefore = new Date(now.getTime() + REMINDER_WINDOW_MS).toISOString();
  const result = await supabase.from('report_deadlines').select('*')
    .is('reminder_sent_at', null)
    .gt('due_at', now.toISOString())
    .lte('due_at', dueBefore);

  // The app remains usable while a deployment awaits the checked-in migration.
  if (result.error && /report_deadlines/i.test(result.error.message)) return;
  const deadlines = unwrap(result);
  await Promise.all(deadlines.map(async (deadline) => {
    const updated = await supabase.from('report_deadlines').update({ reminder_sent_at: now.toISOString() })
      .eq('id', deadline.id).is('reminder_sent_at', null).select('id');
    if (updated.error || !updated.data?.length) return;
    await notify({
      userId: deadline.student_id,
      title: `Report due soon: ${deadline.title}`,
      body: `Your report is due ${new Date(deadline.due_at).toLocaleString()}.`,
      relatedEntityType: 'report_deadline',
      relatedEntityId: deadline.id,
    });
  }));
}

export function startReportDeadlineReminders() {
  sendUpcomingReportDeadlineReminders().catch((error) => console.error('[report deadlines] reminder check failed:', error.message));
  setInterval(() => {
    sendUpcomingReportDeadlineReminders().catch((error) => console.error('[report deadlines] reminder check failed:', error.message));
  }, 60 * 60 * 1000).unref();
}
