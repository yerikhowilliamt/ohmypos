import { test, expect } from '@playwright/test';
import { OWNER_STATE } from './fixtures';

test('OWNER can create a raw material', async ({ browser }) => {
  const context = await browser.newContext({ storageState: OWNER_STATE });
  const page = await context.newPage();
  await page.goto('/master-data/raw-materials');
  // Open add dialog
  await page.locator('button:has-text("Tambah Bahan Baku")').first().click();
  // Fill the form
  const ts = Date.now();
  const name = `PW Bahan ${ts}`;
  await page.locator('input#rm-name').fill(name);
  await page.locator('input#rm-unit').fill('gram');
  // ADR-024 split the supplier's pack unit from the stock/recipe unit, and
  // `purchaseUnit` is required with no default — leaving it blank silently
  // fails client-side validation and the dialog never submits.
  await page.locator('input#rm-purchase-unit').fill('kg');
  await page.locator('input#rm-conversion').fill('1000');
  await page.locator('input#rm-cost').fill('10000');
  await page.locator('input#rm-threshold').fill('5');
  // Submit — click the dialog's own submit button (not the page header one)
  await page
    .locator('[role="dialog"] button:has-text("Tambah Bahan Baku")')
    .click();
  // Verify the new row appears
  const row = page.locator('tr', { hasText: name });
  await expect(row).toBeVisible({ timeout: 10000 });
  // …and that it kept the conversion, not just the name.
  await expect(row).toContainText('1 kg =');
  await context.close();
});
