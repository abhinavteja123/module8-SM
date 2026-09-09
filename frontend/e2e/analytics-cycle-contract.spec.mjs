import { test, expect } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173';
const password = 'Passw0rd!';

async function signIn(page, email) {
  await page.goto(`${baseURL}/login`);
  await page.getByPlaceholder('you@university.edu').fill(email);
  await page.getByPlaceholder('Enter your password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

function isAnalyticsOverviewRequest(request) {
  const url = new URL(request.url());
  return request.method() === 'GET' && url.pathname.endsWith('/api/analytics/overview');
}

test('CRCS analytics always requests the selected cycle and refreshes when it changes', async ({ page }) => {
  const overviewRequests = [];
  page.on('request', (request) => {
    if (isAnalyticsOverviewRequest(request)) overviewRequests.push(new URL(request.url()));
  });

  await signIn(page, 'crcs.admin@example.edu');
  await page.goto(`${baseURL}/crcs/analytics`);
  await expect(page.getByRole('heading', { name: 'Internship programme intelligence' })).toBeVisible();

  // The responsive shell renders a desktop and a mobile header; use the
  // first visible switcher rather than letting Playwright's strict locator
  // treat that intentional duplication as an application failure.
  const cycleSwitcher = page.locator('select[aria-label="Selected internship cycle"]:visible').first();
  await expect(cycleSwitcher).toBeVisible();
  const cycles = await cycleSwitcher.locator('option').evaluateAll((options) => options.map((option) => option.value).filter(Boolean));
  test.skip(cycles.length < 2, 'Requires two CRCS-visible cycles; run `npm run seed:cycles` before this regression.');

  const initialCycleId = await cycleSwitcher.inputValue();
  await expect.poll(() => overviewRequests.some((url) => url.searchParams.get('cycle_id') === initialCycleId)).toBe(true);
  expect(overviewRequests.every((url) => Boolean(url.searchParams.get('cycle_id')))).toBe(true);

  const nextCycleId = cycles.find((id) => id !== initialCycleId);
  const refreshed = page.waitForRequest((request) => isAnalyticsOverviewRequest(request) && new URL(request.url()).searchParams.get('cycle_id') === nextCycleId);
  await cycleSwitcher.selectOption(nextCycleId);
  await refreshed;

  expect(overviewRequests.some((url) => url.searchParams.get('cycle_id') === nextCycleId)).toBe(true);
});
