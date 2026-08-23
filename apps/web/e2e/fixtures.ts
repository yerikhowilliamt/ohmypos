export const OWNER_CREDS = {
  email: 'owner@ohmypos.local',
  password: 'ChangeMe123!',
};
export const ADMIN_CREDS = {
  email: 'admin@ohmypos.local',
  password: 'ChangeMe123!',
};
export const KASIR_CREDS = {
  email: 'kasir@ohmypos.local',
  password: 'ChangeMe123!',
};

export async function login(
  page: import('@playwright/test').Page,
  creds: { email: string; password: string },
) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(creds.email);
  await page.locator('input[type="password"]').fill(creds.password);
  await page.locator('button:has-text("Masuk")').click();
  await page.waitForURL(/\/(master-data|reconciliation|sales)/);
}
