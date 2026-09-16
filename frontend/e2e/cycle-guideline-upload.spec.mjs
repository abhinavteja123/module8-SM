import { test, expect } from '@playwright/test';

// Guideline PDFs can be added/edited/deleted for the life of a cycle — only
// a closed cycle is frozen (see cycleDocuments.js). Previously this was
// draft-only, which is what made the upload control "sometimes work, sometimes
// not" depending on which cycle status the user happened to be on; that
// restriction was deliberately removed. This test also guards the earlier
// isDraft/canEditRoster prop-mixup bug from regressing.
const baseURL = process.env.PORTAL_URL ?? 'http://127.0.0.1:5173';

async function quickLogin(page, roleLabel) {
  await page.goto(`${baseURL}/login`);
  await page.getByRole('button', { name: new RegExp(roleLabel) }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 15_000 });
}

test('required-documents upload is offered on an open cycle too, and works on a draft cycle', async ({ page }) => {
  await quickLogin(page, 'CRCS Superadmin');
  await page.goto(`${baseURL}/crcs/cycles`);
  await expect(page.getByRole('heading', { name: 'Cycle details' })).toBeVisible({ timeout: 15_000 });

  // Open cycle (2023-2027, status Open) jumps straight to step 3. "Add a PDF"
  // and "Delete" should both be offered here now, not just on a draft.
  await page.getByRole('button', { name: /2023-2027/ }).click();
  await expect(page.getByRole('heading', { name: 'Required documents' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Add a PDF' })).toBeVisible({ timeout: 15_000 });

  // Don't actually upload/delete against the real 2023-2027 cycle here (it's
  // live demo data) — a fresh disposable draft cycle covers the functional
  // upload path below without polluting it.
  const cycleName = `E2E Guideline Test ${Date.now()}`;
  await page.getByRole('button', { name: 'Cycle details' }).click();
  await page.getByPlaceholder('TF 2028 Internship Cycle').fill(cycleName);
  await page.getByRole('button', { name: 'Build cycle roster' }).click();
  await expect(page.getByRole('heading', { name: /Build roster for/ })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Continue to required documents' }).click();
  await expect(page.getByRole('heading', { name: 'Add a PDF' })).toBeVisible({ timeout: 15_000 });

  const minimalPdf = Buffer.from(
    '%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>',
    'utf-8'
  );
  // The app's <Label> never sets htmlFor/id, so getByLabel can't associate it —
  // scope to the form instead of relying on accessible-label lookup.
  const uploadForm = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Add a PDF' }) });
  await uploadForm.getByRole('textbox').fill('E2E Handbook');
  await uploadForm.locator('input[type="file"]').setInputFiles({ name: 'handbook.pdf', mimeType: 'application/pdf', buffer: minimalPdf });
  await uploadForm.getByRole('button', { name: 'Upload document' }).click();
  await expect(page.getByText('E2E Handbook')).toBeVisible({ timeout: 15_000 });

  // Clean up: delete the draft cycle so repeated runs don't pile up.
  await page.getByRole('button', { name: 'Cycle details' }).click();
  await page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete draft' }).first().click();
  await expect(page.getByText(cycleName)).toHaveCount(0, { timeout: 15_000 });
});
