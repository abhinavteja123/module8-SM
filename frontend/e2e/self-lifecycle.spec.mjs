import { test, expect } from '@playwright/test';
import { supabase, unwrap } from '../../backend/src/db/client.js';
import { createPortalUser } from '../../backend/src/lib/users.js';

const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173';
const runKey = `E2E SELF ${Date.now()}`;
const email = `e2e.self.${Date.now()}@example.edu`;
const password = 'Passw0rd!';
const artifacts = { userId: null, internshipId: null, deadlineIds: [], documentIds: [], paths: [] };

async function selectContaining(page, text) {
  const selects = page.locator('select');
  for (let index = 0; index < await selects.count(); index += 1) {
    const select = selects.nth(index);
    const options = await select.locator('option').evaluateAll((items) => items.map((item) => ({ value: item.value, text: item.textContent ?? '' })));
    const matching = options.find((option) => option.text.includes(text));
    if (matching) {
      await select.selectOption(matching.value);
      return;
    }
  }
  throw new Error(`No select option contains ${text}`);
}

async function signIn(page, loginEmail, loginPassword = password) {
  await page.goto(`${baseURL}/login`);
  await page.locator('input[type="email"]').fill(loginEmail);
  await page.locator('input[type="password"]').fill(loginPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

async function cleanup() {
  const entityIds = [artifacts.internshipId, ...artifacts.deadlineIds, ...artifacts.documentIds].filter(Boolean);
  if (artifacts.internshipId) {
    const docs = unwrap(await supabase.from('documents').select('id,file_path').eq('related_entity_type', 'self_internship').eq('related_entity_id', artifacts.internshipId));
    artifacts.documentIds = [...new Set([...artifacts.documentIds, ...docs.map((doc) => doc.id)])];
    artifacts.paths = [...new Set([...artifacts.paths, ...docs.map((doc) => doc.file_path)])];
    const deadlines = unwrap(await supabase.from('report_deadlines').select('id').eq('related_entity_type', 'self_internship').eq('related_entity_id', artifacts.internshipId));
    artifacts.deadlineIds = [...new Set([...artifacts.deadlineIds, ...deadlines.map((deadline) => deadline.id)])];
    const ids = [artifacts.internshipId, ...artifacts.deadlineIds, ...artifacts.documentIds];
    await supabase.from('notifications').delete().in('related_entity_id', ids);
    await supabase.from('audit_log').delete().in('entity_id', ids);
    await supabase.from('self_internships').update({ company_profile_doc_id: null, offer_letter_doc_id: null, certificate_doc_id: null }).eq('id', artifacts.internshipId);
    await supabase.from('documents').delete().in('id', artifacts.documentIds);
    await supabase.from('report_deadlines').delete().in('id', artifacts.deadlineIds);
    await supabase.from('self_internships').delete().eq('id', artifacts.internshipId);
  }
  if (artifacts.paths.length) await supabase.storage.from(process.env.SUPABASE_STORAGE_BUCKET ?? 'documents').remove(artifacts.paths);
  if (artifacts.userId) {
    await supabase.from('student_track_selections').delete().eq('student_id', artifacts.userId);
    await supabase.from('notifications').delete().eq('user_id', artifacts.userId);
    await supabase.from('audit_log').delete().eq('actor_id', artifacts.userId);
    await supabase.from('students').delete().eq('id', artifacts.userId);
    await supabase.from('user_roles').delete().eq('user_id', artifacts.userId);
    await supabase.from('users').delete().eq('id', artifacts.userId);
  }
}

test.beforeAll(async () => {
  const department = unwrap(await supabase.from('departments').select('id').eq('code', 'CSE').maybeSingle());
  const cycle = unwrap(await supabase.from('internship_cycles').select('id').eq('status', 'open').limit(1).maybeSingle());
  if (!department || !cycle) throw new Error('E2E precondition failed: an open cycle and CSE department are required.');
  const user = await createPortalUser({
    email,
    password,
    full_name: `${runKey} Student`,
    roles: [{ role: 'student', department_id: department.id }],
    roll_number: `E2E-${Date.now()}`,
    batch_year: 2026,
  });
  artifacts.userId = user.id;
  unwrap(await supabase.from('student_track_selections').insert({ student_id: user.id, cycle_id: cycle.id, track: 'self_internship' }));
});

test.afterEach(async () => { await cleanup(); });

test('student, CRCS, and mentor complete the self-internship lifecycle', async ({ browser }) => {
  test.setTimeout(120000);
  const studentContext = await browser.newContext();
  const crcsContext = await browser.newContext();
  const mentorContext = await browser.newContext();
  const student = await studentContext.newPage();
  const crcs = await crcsContext.newPage();
  const mentor = await mentorContext.newPage();
  const company = `${runKey} Labs`;
  const rejectionReason = 'Please upload the corrected offer letter with the internship dates.';
  const reportTitle = `${runKey} weekly report`;

  try {
    await signIn(student, email);
    await expect(student.getByRole('heading', { name: 'My self-internship' })).toBeVisible();
    await student.locator('input[type="text"]').fill(company);
    await student.locator('input[type="url"]').fill('https://example.com/e2e-self-internship');
    await student.locator('textarea').nth(0).fill('1 E2E Avenue, Test City, Telangana 500001');
    await student.locator('textarea').nth(1).fill('Direct application through the company careers portal.');
    await student.locator('input[type="file"]').setInputFiles({ name: 'offer-letter.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 temporary offer letter') });
    await student.getByRole('button', { name: 'Upload documents and submit to CRCS' }).click();
    await expect(student.getByText('Your request and documents are with CRCS for review.')).toBeVisible();

    const record = unwrap(await supabase.from('self_internships').select('id').eq('student_id', artifacts.userId).eq('company_name', company).maybeSingle());
    artifacts.internshipId = record?.id ?? null;
    expect(artifacts.internshipId).toBeTruthy();

    await signIn(crcs, 'crcs.admin@example.edu');
    await crcs.goto(`${baseURL}/crcs/approvals`);
    await crcs.getByRole('button', { name: 'Self-internships' }).click();
    await selectContaining(crcs, company);
    await expect(crcs.getByText('Offer received through:')).toBeVisible();
    await crcs.locator('input[placeholder*="Explain why"]').fill(rejectionReason);
    await crcs.getByRole('button', { name: 'Reject', exact: true }).click();
    await expect(crcs.getByText(`Rejected: ${rejectionReason}`)).toBeVisible();

    await student.reload();
    await expect(student.getByText('CRCS requested corrections')).toBeVisible();
    await expect(student.getByText(rejectionReason)).toBeVisible();
    await student.locator('input[type="file"]').setInputFiles({ name: 'corrected-offer-letter.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 corrected temporary offer letter') });
    await student.getByRole('button', { name: 'Re-upload and return to CRCS' }).click();
    await expect(student.getByText('Your request and documents are with CRCS for review.')).toBeVisible();

    await crcs.reload();
    await crcs.getByRole('button', { name: 'Self-internships' }).click();
    await selectContaining(crcs, company);
    await crcs.getByRole('button', { name: 'Approve internship' }).click();
    await expect(crcs.getByText('The student is approved and waiting for a faculty mentor.')).toBeVisible();

    await student.reload();
    await expect(student.getByText('Approved and locked')).toBeVisible();
    await expect(student.getByText('while CRCS assigns a faculty mentor')).toBeVisible();

    await selectContaining(crcs, 'Indira Industry Mentor');
    await crcs.getByRole('button', { name: 'Allocate mentor' }).click();
    await expect(crcs.getByText('Current mentor: Indira Industry Mentor.')).toBeVisible();
    await crcs.goto(`${baseURL}/crcs/mentor-allocations`);
    await expect(crcs.getByText(company)).toBeVisible();
    await expect(crcs.getByText('No manual hierarchy setup is needed.')).toBeVisible();
    await expect(crcs.getByText(/Department: CSE/)).toBeVisible();

    await signIn(mentor, 'industry.mentor@example.edu');
    await mentor.goto(`${baseURL}/faculty/report-deadlines`);
    await selectContaining(mentor, company);
    await mentor.locator('input[type="text"]').fill(reportTitle);
    await mentor.locator('input[type="datetime-local"]').fill('2026-10-30T10:00');
    await mentor.getByRole('button', { name: 'Set deadline and notify student' }).click();
    await expect(mentor.getByText(reportTitle)).toBeVisible();

    const deadline = unwrap(await supabase.from('report_deadlines').select('id').eq('student_id', artifacts.userId).eq('related_entity_id', artifacts.internshipId).maybeSingle());
    artifacts.deadlineIds.push(deadline?.id);

    await student.reload();
    await expect(student.getByText('Faculty mentor allocated: Indira Industry Mentor')).toBeVisible();
    await expect(student.getByText(reportTitle)).toBeVisible();
    await student.getByRole('button', { name: 'Open report submissions' }).click();
    await expect(student.getByText('Report deadline reminders')).toBeVisible();
    await selectContaining(student, reportTitle);
    await student.locator('input[type="file"]').setInputFiles({ name: 'weekly-report.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 temporary weekly report') });
    await student.locator('input[type="number"]').fill('1');
    await student.getByRole('button', { name: 'Upload document' }).click();
    await expect(student.getByText('weekly-report.pdf')).toBeVisible();

    await mentor.goto(`${baseURL}/faculty/documents`);
    await expect(mentor.getByText('weekly-report.pdf')).toBeVisible();
    await selectContaining(mentor, 'weekly-report.pdf');
    await mentor.locator('#review-message').fill('E2E review: please add a short summary of the completed work.');
    await mentor.getByRole('button', { name: 'Send update request' }).click();
    await expect(mentor.getByText('Update request sent. The student has been notified.')).toBeVisible();

    await student.reload();
    await expect(student.getByText(/Mentor feedback: E2E review/)).toBeVisible();
  } finally {
    await Promise.all([studentContext.close(), crcsContext.close(), mentorContext.close()]);
  }
});
