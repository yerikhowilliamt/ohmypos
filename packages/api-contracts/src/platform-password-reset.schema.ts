import { z } from 'zod';
import { UuidString } from './primitives';

/**
 * ADR-025 — a platform operator setting the password of a tenant OWNER who is
 * locked out of their own account (TASK-130).
 *
 * `userId` is explicit rather than inferred from the tenant, even though
 * `TenantDetailResponse.ownerId` implies there is only one. A tenant MAY have
 * more than one OWNER, and guessing "the first OWNER found" would let an
 * operator reset an account they did not mean to without ever learning they
 * had. The caller names who; the server verifies that person really is an
 * OWNER of that tenant.
 *
 * `reason` follows `StartImpersonationSchema` — the same 10-character floor,
 * for the same reason: this is an operator acting on someone else's account,
 * and actions like that leave a trail a human can read.
 */
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
