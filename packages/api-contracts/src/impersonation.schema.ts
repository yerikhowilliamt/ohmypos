import { z } from 'zod';
import { UuidString } from './primitives';

/**
 * ADR-025 Decision 8 — impersonation is read-only, logged, and short-lived.
 *
 * `reason` is required and has a real minimum length because this record is
 * the only account of why an operator looked inside a customer's books. A
 * one-word reason ("debug") makes the audit trail technically complete and
 * practically worthless, so the schema refuses it at the edge rather than
 * relying on operator discipline.
 */
export const StartImpersonationSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, 'Alasan wajib diisi, minimal 10 karakter — ini dicatat permanen')
    .max(500, 'Maksimal 500 karakter'),
});
export type StartImpersonation = z.infer<typeof StartImpersonationSchema>;

export const ImpersonationSessionResponseSchema = z.object({
  id: UuidString,
  platformAdminId: UuidString,
  tenantId: UuidString,
  /** The tenant's OWNER whose identity is borrowed. */
  actingAsUserId: UuidString,
  actingAsEmail: z.string(),
  reason: z.string(),
  startedAt: z.date().or(z.string()),
  endedAt: z.date().or(z.string()).nullable(),
  /**
   * Present only on the response that STARTS a session — this is the tenant
   * access token the console then sends as an ordinary user. Deliberately
   * short-lived (30 minutes) and issued with no refresh token, so an
   * impersonation session cannot be silently extended.
   */
  accessToken: z.string().optional(),
  expiresAt: z.date().or(z.string()).optional(),
});
export type ImpersonationSessionResponse = z.infer<
  typeof ImpersonationSessionResponseSchema
>;
