import path from 'path';

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

/**
 * ADR-025 — the platform console signs in against `platform_admins`, not
 * `users`, so it needs its own credentials and its own storage state. The seed
 * creates this account (`prisma/seed.ts`); `pnpm --filter api create:platform-admin`
 * is the production path.
 */
export const PLATFORM_CREDS = {
  email: process.env.SEED_PLATFORM_ADMIN_EMAIL ?? 'platform@ohmypos.local',
  password: process.env.SEED_PLATFORM_ADMIN_PASSWORD ?? 'ChangeMe123!',
};

export const OWNER_STATE = path.join(__dirname, '.auth/owner.json');
export const ADMIN_STATE = path.join(__dirname, '.auth/admin.json');
export const KASIR_STATE = path.join(__dirname, '.auth/kasir.json');
export const PLATFORM_STATE = path.join(__dirname, '.auth/platform.json');
