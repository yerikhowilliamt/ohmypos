import { test, expect } from '@playwright/test';
import { KASIR_STATE } from './auth.setup';

test('KASIR is redirected away from /master-data', async ({ browser }) => {
  const context = await browser.newContext({ storageState: KASIR_STATE });
  const page = await context.newPage();
  await page.goto('/master-data');
  // KASIR cannot access master-data — should redirect away
  await expect(page).not.toHaveURL(/master-data/, { timeout: 8000 });
  await context.close();
});
