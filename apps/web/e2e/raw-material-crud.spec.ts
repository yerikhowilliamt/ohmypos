import { test, expect } from '@playwright/test';
import { OWNER_CREDS, login } from './fixtures';

test('OWNER can create a raw material', async ({ page }) => {
  await login(page, OWNER_CREDS);
  await page.goto('/master-data');
  // Switch to Bahan Baku tab
  await page.locator('[role="tab"]:has-text("Bahan Baku")').click();
  // Open add dialog
  await page.locator('button:has-text("Tambah Bahan Baku")').first().click();
  // Fill the form
  const ts = Date.now();
  await page.locator('input#rm-name').fill(`PW Bahan ${ts}`);
  await page.locator('input#rm-unit').fill('kg');
  await page.locator('input#rm-cost').fill('10000');
  await page.locator('input#rm-threshold').fill('5');
  // Submit — click the dialog's own submit button (not the page header one)
  await page
    .locator('[role="dialog"] button:has-text("Tambah Bahan Baku")')
    .click();
  // Verify the new row appears
  await expect(page.locator(`text=PW Bahan ${ts}`)).toBeVisible({
    timeout: 10000,
  });
});
