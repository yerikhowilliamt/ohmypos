import { test, expect } from '@playwright/test';
import { OWNER_STATE, ADMIN_STATE, KASIR_STATE } from './auth.setup';

test('OWNER can login and lands on dashboard', async ({ browser }) => {
  const context = await browser.newContext({ storageState: OWNER_STATE });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page).toHaveURL(/dashboard/);
  await context.close();
});

test('ADMIN can login and lands on master-data', async ({ browser }) => {
  const context = await browser.newContext({ storageState: ADMIN_STATE });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page).toHaveURL(/master-data/);
  await context.close();
});

test('KASIR can login and lands on sales', async ({ browser }) => {
  const context = await browser.newContext({ storageState: KASIR_STATE });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page).toHaveURL(/sales/);
  await context.close();
});
