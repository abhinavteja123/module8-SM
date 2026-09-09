import { test, expect } from '@playwright/test';
import { supabase, unwrap } from '../../backend/src/db/client.js';
import { createPortalUser } from '../../backend/src/lib/users.js';

const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173';
const stamp = Date.now();
const title = `E2E Research ${stamp}`;
const email = `e2e.research.${stamp}@example.edu`;
const password = 'Passw0rd!';
const artifacts = { studentId: null, projectId: null, applicationId: null };

async function login(page, loginEmail, loginPassword = password) {
  await page.goto(`${baseURL}/login`);
  await page.locator('input[type="email"]').fill(loginEmail);
  await page.locator('input[type="password"]').fill(loginPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

async function cleanup() {
  const ids = [artifacts.projectId, artifacts.applicationId].filter(Boolean);
  if (artifacts.applicationId) {
    await supabase.from('report_deadlines').delete().eq('research_application_id', artifacts.applicationId);
    await supabase.from('mentor_assignments').delete().eq('student_id', artifacts.studentId);
    await supabase.from('audit_log').delete().in('entity_id', ids);
    await supabase.from('notifications').delete().in('related_entity_id', ids);
    await supabase.from('research_applications').delete().eq('id', artifacts.applicationId);
  }
  if (artifacts.projectId) await supabase.from('research_projects').delete().eq('id', artifacts.projectId);
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
  const student = await createPortalUser({ email, password, full_name: `E2E Research ${stamp}`, roles: [{ role: 'student', department_id: department.id }], roll_number: `RES-${stamp}`, batch_year: 2026 });
  artifacts.studentId = student.id;
});

test.afterEach(async () => { await cleanup(); });

test('faculty, student, and CRCS complete the research approval path', async ({ browser }) => {
  test.setTimeout(120_000);
  const facultyContext = await browser.newContext();
  const studentContext = await browser.newContext();
  const crcsContext = await browser.newContext();
  const faculty = await facultyContext.newPage();
  const student = await studentContext.newPage();
  const crcs = await crcsContext.newPage();
  faculty.setDefaultTimeout(8_000);
  student.setDefaultTimeout(8_000);
  crcs.setDefaultTimeout(8_000);
  try {
    await login(faculty, 'faculty@example.edu');
    await faculty.goto(`${baseURL}/faculty`);
    await faculty.getByPlaceholder('For example, Applied AI research').fill(title);
    await faculty.getByPlaceholder('Describe the problem, expected work, and learning outcomes.').fill('Disposable project used to exercise every research approval save action.');
    await faculty.getByRole('button', { name: 'Add project' }).first().click();
    await expect(faculty.getByRole('status')).toContainText('Project created successfully.');
    const project = unwrap(await supabase.from('research_projects').select('id').eq('title', title).maybeSingle());
    artifacts.projectId = project?.id ?? null;
    expect(artifacts.projectId).toBeTruthy();

    const projectCard = faculty.getByText(title, { exact: true }).locator('xpath=../../../..');
    await projectCard.getByRole('button', { name: 'Edit' }).click();
    await projectCard.locator('input').fill(`${title} Updated`);
    await projectCard.getByRole('button', { name: 'Save changes' }).click();
    await expect(faculty.getByRole('status')).toContainText('Project changes saved successfully.');

    await login(student, email);
    await student.waitForURL(/\/student\/preference$/);
    await student.getByRole('button', { name: /Research Internship/ }).click();
    await student.getByRole('button', { name: 'Save my preference' }).click();
    await student.waitForURL(/\/student\/research$/);
    await student.getByRole('link', { name: 'Browse projects' }).click();
    const listingCard = student.getByText(`${title} Updated`, { exact: true }).locator('xpath=../..');
    await listingCard.getByRole('button', { name: 'Send Application' }).click();
    await expect(student.getByText('Application sent. You will see the faculty and CRCS decisions in your Research page.')).toBeVisible();
    const application = unwrap(await supabase.from('research_applications').select('id,status').eq('student_id', artifacts.studentId).eq('project_id', artifacts.projectId).maybeSingle());
    artifacts.applicationId = application?.id ?? null;
    expect(application?.status).toBe('pending_faculty');

    await faculty.goto(`${baseURL}/faculty/applications`);
    const facultyRow = faculty.getByText(`${title} Updated`, { exact: true }).locator('xpath=ancestor::tr');
    await facultyRow.getByRole('button', { name: 'Review' }).click();
    await faculty.getByRole('button', { name: 'Send to CRCS' }).click();
    await expect(faculty.getByText(`${title} Updated`, { exact: true })).toHaveCount(0);

    await login(crcs, 'crcs.admin@example.edu');
    await crcs.goto(`${baseURL}/crcs/approvals`);
    const crcsRow = crcs.getByText(`${title} Updated`, { exact: true }).locator('xpath=ancestor::tr');
    await crcsRow.getByRole('button', { name: 'Review' }).click();
    await crcs.getByRole('button', { name: 'Approve internship' }).click();
    await expect(crcsRow.getByText('Approved')).toBeVisible();
    const approved = unwrap(await supabase.from('research_applications').select('status').eq('id', artifacts.applicationId).single());
    expect(approved.status).toBe('crcs_approved');
  } finally {
    await Promise.all([facultyContext.close(), studentContext.close(), crcsContext.close()]);
  }
});
