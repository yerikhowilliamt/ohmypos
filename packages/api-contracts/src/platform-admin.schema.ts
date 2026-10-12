import { z } from 'zod';
import { UuidString } from './primitives';

/** Platform console login. Kept separate from `LoginSchema` on purpose (ADR-025 Decision 5). */
export const PlatformAdminLoginSchema = z.object({
  email: z.email().toLowerCase(),
  password: z.string().min(1, 'Kata sandi wajib diisi'),
});
export type PlatformAdminLogin = z.infer<typeof PlatformAdminLoginSchema>;

/** A platform admin changes their own password. 12-character minimum (TASK-130). */
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
