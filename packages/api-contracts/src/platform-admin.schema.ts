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

/**
 * ADR-025 Fase 3 lanjutan (TASK-130) — a platform admin changing their own
 * password. Before this, the only way to alter or disable a platform account
 * was through the database.
 *
 * Deliberately NOT reusing `ChangePasswordSchema`, for the same reason written
 * above for `PlatformAdminLoginSchema`: the two endpoints authenticate
 * different tables against different keys, and a shared symbol is how someone
 * later "simplifies" them into one.
 *
 * The floor is 12, not 8. That is not taste — `create-platform-admin.ts` has
 * refused anything under 12 since the first platform account existed, and an
 * endpoint that accepts 8 would be a way around a standard already in force.
 * One session here reaches every tenant.
 */
export const PlatformAdminChangePasswordSchema = z.object({
  oldPassword: z.string().min(1, 'Kata sandi saat ini wajib diisi'),
  newPassword: z.string().min(12, 'Minimal 12 karakter').max(200),
});
export type PlatformAdminChangePassword = z.infer<
  typeof PlatformAdminChangePasswordSchema
>;

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
