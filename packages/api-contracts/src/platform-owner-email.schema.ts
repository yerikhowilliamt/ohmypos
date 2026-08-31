import { z } from 'zod';
import { UuidString } from './primitives';

/**
 * ADR-025 — a platform operator correcting the email a tenant OWNER logs in
 * with (TASK-131).
 *
 * This exists because `email` is the login identity and there is no way to fix
 * a wrong one from inside the tenant: a mistyped owner email at provisioning
 * means nobody can ever log in, there is no self-registration, and
 * `ResetTenantOwnerPasswordSchema` does not help — resetting the password of an
 * address the owner does not own changes nothing.
 *
 * `userId` is named explicitly for the same reason it is in the password reset:
 * a tenant MAY hold more than one OWNER, and "the first OWNER found" would let
 * an operator rewrite the login of an account they did not mean to.
 *
 * `reason` matches `StartImpersonationSchema` and the password reset — same
 * 10-character floor, same purpose: an operator acting on somebody else's
 * account leaves a trail a human can read.
 */
export const UpdateTenantOwnerEmailSchema = z.object({
  userId: UuidString,
  newEmail: z.email().toLowerCase(),
  reason: z
    .string()
    .trim()
    .min(10, 'Alasan wajib diisi, minimal 10 karakter — ini dicatat permanen')
    .max(500, 'Maksimal 500 karakter'),
  /**
   * The typo case this endpoint is for is a tenant provisioned minutes ago with
   * nothing in it. On a tenant that has been trading, the same call transfers
   * login control of a live business — so the server checks whether the tenant
   * still looks untouched and, if it does not, refuses until the caller says
   * in this field that it knows. Deliberately a speed bump, not a wall: the
   * operator who genuinely needs it is not blocked, but cannot do it by
   * reflex. Ignored when the tenant is pristine.
   */
  acknowledgeExistingData: z.boolean().optional(),
});
export type UpdateTenantOwnerEmail = z.infer<
  typeof UpdateTenantOwnerEmailSchema
>;

export const UpdateTenantOwnerEmailResponseSchema = z.object({
  message: z.string(),
  ownerId: UuidString,
  ownerEmail: z.string(),
});
export type UpdateTenantOwnerEmailResponse = z.infer<
  typeof UpdateTenantOwnerEmailResponseSchema
>;
