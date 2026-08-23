import { test, expect } from '@playwright/test';
import { KASIR_CREDS, login } from './fixtures';

test('KASIR is redirected away from /master-data', async ({ page }) => {
  await login(page, KASIR_CREDS);
  await page.goto('/master-data');
  // Should redirect away — not render the master data page
  await expect(page).not.toHaveURL(/master-data/, { timeout: 5000 });
});
