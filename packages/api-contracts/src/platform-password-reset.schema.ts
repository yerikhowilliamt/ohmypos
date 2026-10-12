import { z } from 'zod';
import { UuidString } from './primitives';

/** A platform operator resets a locked-out tenant OWNER's password (TASK-130). */
export const ResetTenantOwnerPasswordSchema = z.object({
  userId: UuidString,
  newPassword: z.string().min(8).max(200),
  reason: z
    .string()
    .trim()
    .min(10, 'Alasan wajib diisi, minimal 10 karakter — ini dicatat permanen')
    .max(500, 'Maksimal 500 karakter'),
});
export type ResetTenantOwnerPassword = z.infer<
  typeof ResetTenantOwnerPasswordSchema
>;
