import { test, expect } from '@playwright/test';

const password = 'Passw0rd!';
const baseUrl = 'http://127.0.0.1:5173';

async function signIn(page, email) {
  await page.goto(`${baseUrl}/login`);
  await page.getByPlaceholder('you@university.edu').fill(email);
  await page.getByPlaceholder('Enter your password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

async function signOut(page) {
  const logout = page.getByRole('button', { name: /log out/i });
  await expect(logout).toBeVisible();
  await logout.click();
  await expect(page).toHaveURL(/\/login$/);
}

test('invalid credentials stay on the login screen with an error', async ({ page }) => {
  await page.goto(`${baseUrl}/login`);
  await page.getByPlaceholder('you@university.edu').fill('student@example.edu');
  await page.getByPlaceholder('Enter your password').fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test('student track guards redirect self-internship and opportunity students to their own workspaces', async ({ page }) => {
  const cases = [
    { email: 'nisha.cse@example.edu', denied: '/student/opportunities', expected: /\/student\/self-internship$/ },
    { email: 'arjun.cse@example.edu', denied: '/student/self-internship', expected: /\/student\/opportunities$/ },
  ];
  for (const entry of cases) {
    await signIn(page, entry.email);
    await page.goto(`${baseUrl}${entry.denied}`);
    await expect(page).toHaveURL(entry.expected);
    await expect(page.getByText('Student Portal', { exact: true }).first()).toBeVisible();
    await signOut(page);
  }
});

const roleLandingCases = [
  { email: 'nisha.cse@example.edu', path: /\/student\/self-internship$/, portal: 'Student Portal' },
  { email: 'arjun.cse@example.edu', path: /\/student\/opportunities$/, portal: 'Student Portal' },
  { email: 'faculty@example.edu', path: /\/faculty$/, portal: 'Faculty Research Portal' },
  { email: 'industry.mentor@example.edu', path: /\/faculty$/, portal: 'Faculty Internship Mentor' },
  { email: 'coordinator@example.edu', path: /\/coordinator$/, portal: 'Coordinator / HOD / Dean' },
  { email: 'hod@example.edu', path: /\/coordinator$/, portal: 'Coordinator / HOD / Dean' },
  { email: 'dean@example.edu', path: /\/coordinator$/, portal: 'Coordinator / HOD / Dean' },
  { email: 'school.office@example.edu', path: /\/coordinator$/, portal: 'School Office Portal' },
  { email: 'crcs.coordinator@example.edu', path: /\/crcs$/, portal: 'CRCS Portal' },
  { email: 'crcs.admin@example.edu', path: /\/crcs$/, portal: 'CRCS Portal' },
];

for (const entry of roleLandingCases) {
  test(`role landing: ${entry.email}`, async ({ page }) => {
    await signIn(page, entry.email);
    await expect(page).toHaveURL(entry.path);
    await expect(page.getByText(entry.portal, { exact: true }).first()).toBeVisible();
    await signOut(page);
  });
}

test('an anonymous visitor is redirected to login from a protected route', async ({ page }) => {
  await page.goto(`${baseUrl}/crcs`);
  await expect(page).toHaveURL(/\/login$/);
});

for (const protectedPath of ['/faculty', '/coordinator', '/crcs']) {
  test(`a student is blocked from ${protectedPath}`, async ({ page }) => {
    await signIn(page, 'nisha.cse@example.edu');
    await page.goto(`${baseUrl}${protectedPath}`);
    await expect(page, `${protectedPath} must not render for a student`).toHaveURL(/\/student(?:\/|$)/);
  });
}
