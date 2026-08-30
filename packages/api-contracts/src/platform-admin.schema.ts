import { z } from 'zod';
import { UuidString } from './primitives';

/**
 * The platform console's own login (ADR-025 Decision 5). Structurally identical
 * to `LoginSchema` and deliberately kept a separate schema rather than an
 * alias: the two authenticate different tables against different secrets, and
 * a shared symbol is how someone later "simplifies" them into one endpoint.
 *
 * There is no `CreatePlatformAdminSchema`. Platform admins exist only through
 * `pnpm --filter api create:platform-admin`; an HTTP endpoint that mints an
 * account able to read every tenant is not something this API should have.
 */
export const PlatformAdminLoginSchema = z.object({
  email: z.email().toLowerCase(),
  password: z.string().min(1, 'Kata sandi wajib diisi'),
});
export type PlatformAdminLogin = z.infer<typeof PlatformAdminLoginSchema>;

/** No `role` field — every platform admin has identical powers (TASK-125). */
export const PlatformAdminResponseSchema = z.object({
  id: UuidString,
  name: z.string(),
  email: z.string(),
  isActive: z.boolean(),
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
});
export type PlatformAdminResponse = z.infer<typeof PlatformAdminResponseSchema>;
