import { test, expect } from '@playwright/test';
import {
  ADMIN_STATE,
  KASIR_STATE,
  OWNER_STATE,
  PLATFORM_STATE,
} from './fixtures';

/**
 * ADR-025 Decision 5 — the two audiences must not be able to walk into each
 * other's app.
 *
 * `proxy.test.ts` already asserts the same decision table as pure functions.
 * This suite exists because the proxy is not the only thing involved in a real
 * navigation: the cookie has to actually be set under the right name by the
 * right login page, and the console layout's `requirePlatformAdmin()` has to
 * agree with the proxy about who is signed in. A unit test cannot catch the two
 * disagreeing.
 */

test.describe('a tenant role cannot reach the platform console', () => {
  for (const [role, state] of [
    ['OWNER', OWNER_STATE],
    ['ADMIN', ADMIN_STATE],
    ['KASIR', KASIR_STATE],
  ] as const) {
    test(`${role} is sent to /platform/login`, async ({ browser }) => {
      const context = await browser.newContext({ storageState: state });
      const page = await context.newPage();

      // A valid tenant session carries `access_token`, which means nothing to
      // the console — it reads `platform_access_token`.
      await page.goto('/platform');
      await expect(page).toHaveURL(/\/platform\/login/, { timeout: 10000 });

      await page.goto('/platform/tenants');
      await expect(page).toHaveURL(/\/platform\/login/, { timeout: 10000 });

      await context.close();
    });
  }
});

test.describe('the platform admin', () => {
  test('lands on the console and can open a tenant', async ({ browser }) => {
    const context = await browser.newContext({ storageState: PLATFORM_STATE });
    const page = await context.newPage();

    await page.goto('/platform');
    await expect(page).toHaveURL(/\/platform$/);
    await expect(
      page.getByRole('heading', { name: 'Ringkasan Platform' }),
    ).toBeVisible();

    await page.goto('/platform/tenants');
    await expect(page.getByRole('heading', { name: 'Tenant' })).toBeVisible();

    await context.close();
  });

  test('cannot use the tenant app with only a console session', async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: PLATFORM_STATE });
    const page = await context.newPage();

    // The mirror image of the block above: `platform_access_token` is not a
    // tenant session, so the shop app must not accept it either.
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });

    await context.close();
  });

  test('is bounced off the console login while already signed in', async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: PLATFORM_STATE });
    const page = await context.newPage();

    await page.goto('/platform/login');
    await expect(page).toHaveURL(/\/platform$/, { timeout: 10000 });

    await context.close();
  });
});

test('the console login is reachable with no session at all', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('/platform/login');
  await expect(page).toHaveURL(/\/platform\/login/);
  await expect(page.getByText('Konsol Platform — Super Admin')).toBeVisible();

  await context.close();
});
