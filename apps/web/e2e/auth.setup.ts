/**
 * Auth setup — runs once before all tests via the 'setup' project in
 * playwright.config.ts. Logs in as each seed role and saves cookies to a
 * storageState file so individual tests can reuse sessions without hitting
 * the login throttle (10 req/60 s on /auth/login).
 */
import { test as setup } from '@playwright/test';
import path from 'path';
import { OWNER_CREDS, ADMIN_CREDS, KASIR_CREDS } from './fixtures';

export const OWNER_STATE = path.join(__dirname, '.auth/owner.json');
export const ADMIN_STATE = path.join(__dirname, '.auth/admin.json');
export const KASIR_STATE = path.join(__dirname, '.auth/kasir.json');

async function saveSession(
  page: import('@playwright/test').Page,
  creds: { email: string; password: string },
  stateFile: string,
  expectedUrlPattern: RegExp,
) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(creds.email);
  await page.locator('input[type="password"]').fill(creds.password);
  await page.locator('button:has-text("Masuk")').click();
  await page.waitForURL(expectedUrlPattern, { timeout: 30000 });
  await page.context().storageState({ path: stateFile });
}

setup('authenticate as OWNER', async ({ page }) => {
  await saveSession(page, OWNER_CREDS, OWNER_STATE, /\/dashboard/);
});

setup('authenticate as ADMIN', async ({ page }) => {
  await saveSession(page, ADMIN_CREDS, ADMIN_STATE, /\/master-data/);
});

setup('authenticate as KASIR', async ({ page }) => {
  await saveSession(page, KASIR_CREDS, KASIR_STATE, /\/sales/);
});
