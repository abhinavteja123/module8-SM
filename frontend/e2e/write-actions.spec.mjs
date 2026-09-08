import { test, expect } from '@playwright/test';
import { supabase, unwrap } from '../../backend/src/db/client.js';
import { createPortalUser } from '../../backend/src/lib/users.js';

const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173';
const stamp = Date.now();
const title = `E2E Button Flow ${stamp}`;
const email = `e2e.buttons.${stamp}@example.edu`;
const password = 'Passw0rd!';
const artifacts = { studentId: null, opportunityId: null, applicationId: null, documentPaths: [] };

async function login(page, loginEmail, loginPassword = password) {
  await page.goto(`${baseURL}/login`);
  await page.getByPlaceholder('you@university.edu').fill(loginEmail);
  await page.getByPlaceholder('Enter your password').fill(loginPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

async function cleanup() {
  if (artifacts.applicationId) {
    const docs = unwrap(await supabase.from('documents').select('id,file_path').eq('related_entity_type', 'opportunity_application').eq('related_entity_id', artifacts.applicationId));
    artifacts.documentPaths.push(...docs.map((doc) => doc.file_path));
    const ids = [artifacts.applicationId, ...docs.map((doc) => doc.id)];
    await supabase.from('notifications').delete().in('related_entity_id', ids);
    await supabase.from('audit_log').delete().in('entity_id', ids);
    await supabase.from('documents').delete().in('id', docs.map((doc) => doc.id));
    await supabase.from('opportunity_applications').delete().eq('id', artifacts.applicationId);
  }
  if (artifacts.opportunityId) {
    await supabase.from('audit_log').delete().eq('entity_id', artifacts.opportunityId);
    await supabase.from('crcs_opportunities').delete().eq('id', artifacts.opportunityId);
  }
  if (artifacts.documentPaths.length) await supabase.storage.from(process.env.SUPABASE_STORAGE_BUCKET ?? 'documents').remove([...new Set(artifacts.documentPaths)]);
  if (artifacts.studentId) {
    await supabase.from('student_track_selections').delete().eq('student_id', artifacts.studentId);
    await supabase.from('notifications').delete().eq('user_id', artifacts.studentId);
    await supabase.from('audit_log').delete().eq('actor_id', artifacts.studentId);
    await supabase.from('students').delete().eq('id', artifacts.studentId);
    await supabase.from('user_roles').delete().eq('user_id', artifacts.studentId);
    await supabase.from('users').delete().eq('id', artifacts.studentId);
  }
}

test.beforeAll(async () => {
  const department = unwrap(await supabase.from('departments').select('id').eq('code', 'CSE').maybeSingle());
  const student = await createPortalUser({
    email,
    password,
    full_name: `E2E Buttons ${stamp}`,
    roles: [{ role: 'student', department_id: department.id }],
    roll_number: `BTN-${stamp}`,
    batch_year: 2026,
  });
  artifacts.studentId = student.id;
});

test.afterEach(async () => { await cleanup(); });

test('all high-risk save buttons complete and persist the expected state', async ({ browser }) => {
  test.setTimeout(120_000);
  const crcsContext = await browser.newContext();
  const studentContext = await browser.newContext();
  const crcs = await crcsContext.newPage();
  const student = await studentContext.newPage();
  try {
    await login(crcs, 'crcs.admin@example.edu');
    await crcs.goto(`${baseURL}/crcs/opportunities`);
    await crcs.getByRole('button', { name: 'Post new opportunity' }).click();
    await crcs.getByPlaceholder('Applied AI Research Intern').fill(title);
    await crcs.getByPlaceholder('Innovation Lab').fill('E2E Test Organisation');
    await crcs.locator('input[type="date"]').fill('2026-12-30');
    await crcs.getByPlaceholder('Describe the work, team, and outcomes.').fill('Disposable opportunity used to verify the browser save workflow.');
    await crcs.getByRole('button', { name: 'Post opportunity' }).click();
    await expect(crcs.getByText(title, { exact: true })).toBeVisible();

    const opportunity = unwrap(await supabase.from('crcs_opportunities').select('id,title').eq('title', title).maybeSingle());
    artifacts.opportunityId = opportunity?.id ?? null;
    expect(artifacts.opportunityId).toBeTruthy();

    await login(student, email);
    await student.waitForURL(/\/student\/preference$/);
    await student.getByRole('button', { name: /CRCS Opportunity/ }).click();
    await student.getByRole('button', { name: 'Save my preference' }).click();
    await student.waitForURL(/\/student\/opportunities$/);

    await student.goto(`${baseURL}/student/profile`);
    await student.getByPlaceholder('9876543210').fill('9876543210');
    await student.getByPlaceholder('For example, 8.25').fill('8.75');
    await student.getByRole('button', { name: 'Save profile' }).click();
    await expect(student.getByText('Profile saved. Reviewers will see your latest details.')).toBeVisible();
    const profile = unwrap(await supabase.from('users').select('phone').eq('id', artifacts.studentId).single());
    expect(profile.phone).toBe('9876543210');

    await student.goto(`${baseURL}/student/opportunities`);
    const opportunityCard = student.getByText(title, { exact: true }).locator('xpath=../../../..');
    await opportunityCard.getByRole('button', { name: 'Apply now' }).click();
    await opportunityCard.locator('textarea').fill('I am applying through the fully isolated browser regression scenario.');
    await opportunityCard.locator('input[type="file"]').setInputFiles({ name: 'resume.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 temporary resume') });
    await opportunityCard.getByRole('button', { name: 'Submit application' }).click();
    await expect(student.getByRole('status')).toContainText('Application submitted successfully.');

    const application = unwrap(await supabase.from('opportunity_applications').select('id,status').eq('student_id', artifacts.studentId).eq('opportunity_id', artifacts.opportunityId).maybeSingle());
    artifacts.applicationId = application?.id ?? null;
    expect(application?.status).toBe('applied');
    student.once('dialog', (dialog) => dialog.accept());
    await student.getByRole('button', { name: 'Withdraw application' }).click();
    await expect(student.getByRole('status')).toContainText('Application withdrawn successfully.');
    const withdrawn = unwrap(await supabase.from('opportunity_applications').select('status').eq('id', artifacts.applicationId).single());
    expect(withdrawn.status).toBe('revoked');

    await crcs.goto(`${baseURL}/crcs/opportunities`);
    const managerCard = crcs.getByText(title, { exact: true }).locator('xpath=../../..');
    await managerCard.getByRole('button', { name: 'Edit' }).click();
    await crcs.getByPlaceholder('Applied AI Research Intern').fill(`${title} Updated`);
    await crcs.getByRole('button', { name: 'Save changes' }).click();
    await expect(crcs.getByText(`${title} Updated`, { exact: true })).toBeVisible();
    const updated = unwrap(await supabase.from('crcs_opportunities').select('title').eq('id', artifacts.opportunityId).single());
    expect(updated.title).toBe(`${title} Updated`);

    crcs.once('dialog', (dialog) => dialog.accept());
    const updatedCard = crcs.getByText(`${title} Updated`, { exact: true }).locator('xpath=../../..');
    const archiveResponse = crcs.waitForResponse((response) => response.request().method() === 'DELETE' && response.url().includes(`/api/opportunities/${artifacts.opportunityId}`));
    await updatedCard.getByRole('button', { name: 'Delete' }).click();
    expect((await archiveResponse).status()).toBe(204);
    await expect.poll(async () => {
      const stillVisible = await crcs.getByText(`${title} Updated`, { exact: true }).count();
      const archivedVisible = await crcs.getByText('archived', { exact: true }).count();
      return stillVisible === 0 || archivedVisible > 0;
    }).toBe(true);
  } finally {
    await Promise.all([crcsContext.close(), studentContext.close()]);
  }
});
