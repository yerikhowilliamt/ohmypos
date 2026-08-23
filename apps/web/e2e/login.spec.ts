import { test, expect } from '@playwright/test';
import { OWNER_CREDS, ADMIN_CREDS, KASIR_CREDS, login } from './fixtures';

test('OWNER can login and lands on dashboard', async ({ page }) => {
  await login(page, OWNER_CREDS);
  await expect(page).toHaveURL(/dashboard/);
});

test('ADMIN can login and lands on master-data', async ({ page }) => {
  await login(page, ADMIN_CREDS);
  await expect(page).toHaveURL(/master-data/);
});

test('KASIR can login and lands on sales', async ({ page }) => {
  await login(page, KASIR_CREDS);
  await expect(page).toHaveURL(/sales/);
});
