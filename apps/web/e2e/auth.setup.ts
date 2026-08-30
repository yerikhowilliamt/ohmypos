/**
 * Auth setup — runs once before all tests via the 'setup' project in
 * playwright.config.ts. Logs in as each seed role and saves cookies to a
 * storageState file so individual tests can reuse sessions without hitting
 * the login throttle (10 req/60 s on /auth/login).
 */
import { test as setup } from '@playwright/test';
import {
  OWNER_CREDS,
  ADMIN_CREDS,
  KASIR_CREDS,
  PLATFORM_CREDS,
  OWNER_STATE,
  ADMIN_STATE,
  KASIR_STATE,
  PLATFORM_STATE,
} from './fixtures';

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

  // Handle KASIR unregistered-device attendance warning if it appears
  const warningButton = page.locator(
    'button:has-text("Lanjutkan ke Aplikasi")',
  );
  await Promise.race([
    page.waitForURL(expectedUrlPattern, { timeout: 15000 }).catch(() => {}),
    warningButton
      .waitFor({ state: 'visible', timeout: 15000 })
      .then(() => warningButton.click())
      .catch(() => {}),
  ]);

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

/**
 * ADR-025 — a separate login page, a separate cookie pair, and therefore a
 * separate storage state. Deliberately NOT routed through `saveSession`: that
 * helper knows about `/login` and the KASIR attendance warning, neither of
 * which exists here, and folding the two flows into one function is how the
 * console would end up quietly asserting the tenant page's behaviour.
 */
setup('authenticate as PLATFORM ADMIN', async ({ page }) => {
  await page.goto('/platform/login');
  await page.locator('input[type="email"]').fill(PLATFORM_CREDS.email);
  await page.locator('input[type="password"]').fill(PLATFORM_CREDS.password);
  await page.locator('button:has-text("Masuk ke Konsol")').click();
  await page.waitForURL(/\/platform$/, { timeout: 30000 });
  await page.context().storageState({ path: PLATFORM_STATE });
});
