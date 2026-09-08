import { test, expect } from '@playwright/test';

const baseURL = process.env.PORTAL_URL ?? 'http://127.0.0.1:5173';
const password = 'Passw0rd!';

async function login(page, email) {
  await page.goto(`${baseURL}/login`);
  await page.getByPlaceholder('you@university.edu').fill(email);
  await page.getByPlaceholder('Enter your password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 15_000 });
}

async function visit(page, path, heading) {
  await page.goto(`${baseURL}${path}`);
  await expect(page.getByRole('heading', { name: heading })).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(350);
  await expect(page.locator('text=We couldn’t load this summary')).toHaveCount(0);
}

test('invalid login is rejected without leaving the sign-in screen', async ({ page }) => {
  await page.goto(`${baseURL}/login`);
  await page.getByPlaceholder('you@university.edu').fill('crcs.admin@example.edu');
  await page.getByPlaceholder('Enter your password').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/login$/);
});

test('CRCS operational workspace exposes approvals, mentor workflow, reports, marks, analytics, and directory', async ({ page }) => {
  const serverErrors = [];
  page.on('response', (response) => { if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`); });
  await login(page, 'crcs.admin@example.edu');

  await visit(page, '/crcs/approvals', 'Approvals');
  await expect(page.getByRole('button', { name: 'Research internships' })).toBeVisible();
  await page.getByRole('button', { name: 'Self-internships' }).click();
  await expect(page.getByText('Self-internship approvals and mentor allocation')).toBeVisible();

  await visit(page, '/crcs/mentor-allocations', 'Mentor allocations');
  await expect(page.getByText('What happens after CRCS approval?')).toBeVisible();
  await expect(page.getByText('No manual hierarchy setup is needed.')).toBeVisible();
  await expect(page.getByText('deadline reminders then follow automatically')).toBeVisible();

  await visit(page, '/crcs/templates', 'Choose the reports students must submit');
  await expect(page.getByText('Add another report type')).toBeVisible();
  await visit(page, '/crcs/marks', 'Student marks and internships');
  await expect(page.getByText('Internship path', { exact: true })).toBeVisible();
  await visit(page, '/crcs/analytics', 'Internship programme at a glance');
  await visit(page, '/crcs/people', 'All People');
  await expect(page.getByPlaceholder('Name or email')).toBeVisible();
  expect(serverErrors).toEqual([]);
});

test('direct faculty mentor can reach allocation, deadline, report-review, and marks workflows', async ({ page }) => {
  const serverErrors = [];
  page.on('response', (response) => { if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`); });
  await login(page, 'industry.mentor@example.edu');
  await expect(page.getByRole('heading', { name: 'CRCS and self-internship mentor dashboard' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Your next actions')).toBeVisible();
  await visit(page, '/faculty/mentor-allocations', 'Mentor allocations');
  await visit(page, '/faculty/report-deadlines', 'Set report deadlines');
  await expect(page.getByText('Create a report deadline')).toBeVisible();
  await expect(page.getByText('48 hours before it is due')).toBeVisible();
  await visit(page, '/faculty/documents', 'Submission tracker');
  await expect(page.getByText('Ask for an update')).toBeVisible();
  await visit(page, '/faculty/marks', 'Award student marks');
  expect(serverErrors).toEqual([]);
});

test('research faculty plus coordinator, HOD, dean and school office roles load their read-only operational screens', async ({ browser }) => {
  const cases = [
    { email: 'faculty@example.edu', path: '/faculty', heading: 'Manage research projects' },
    { email: 'coordinator@example.edu', path: '/coordinator', heading: 'Your department’s internship progress' },
    { email: 'hod@example.edu', path: '/coordinator', heading: 'Your department’s internship progress' },
    { email: 'dean@example.edu', path: '/coordinator', heading: 'Your school’s internship progress' },
    { email: 'school.office@example.edu', path: '/coordinator', heading: 'Mentor allocations' },
  ];
  for (const role of cases) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const serverErrors = [];
    page.on('response', (response) => { if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`); });
    await login(page, role.email);
    await visit(page, role.path, role.heading);
    expect(serverErrors, `${role.email} must not receive a server error`).toEqual([]);
    await context.close();
  }
});

test('operational detail dialogs and non-destructive supervision controls remain usable', async ({ page }) => {
  await login(page, 'industry.mentor@example.edu');
  await visit(page, '/faculty/mentor-allocations', 'Mentor allocations');
  const studentDetails = page.getByRole('button', { name: /View student details/ }).first();
  if (await studentDetails.count()) {
    await studentDetails.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText(/Student details|Contact|Academic/);
    await page.getByRole('button', { name: 'Close' }).click();
  }

  await visit(page, '/faculty/report-deadlines', 'Set report deadlines');
  await expect(page.getByRole('combobox').first()).toBeVisible();
  await expect(page.getByPlaceholder('Weekly report — week 1')).toBeVisible();

  await visit(page, '/faculty/marks', 'Award student marks');
  const editMarks = page.getByRole('button', { name: /^(Enter marks|Edit)$/ }).first();
  if (await editMarks.count()) {
    await editMarks.click();
    await expect(page.getByRole('dialog', { name: 'Edit student marks' })).toBeVisible();
    await expect(page.getByText('Once marks are saved, the student can no longer edit report submissions.')).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
  }

  await visit(page, '/faculty/documents', 'Submission tracker');
  const viewFile = page.getByRole('button', { name: 'View file' }).first();
  if (await viewFile.count()) {
    await viewFile.click();
    await expect(page.getByRole('dialog', { name: 'View student file' })).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
  }
});
