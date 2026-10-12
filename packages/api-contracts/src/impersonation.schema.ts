import { z } from 'zod';
import { UuidString } from './primitives';

/** Read-only, logged, short-lived impersonation (ADR-025 Decision 8). `reason` is mandatory. */
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
  /** Only on the start response: a 30-minute tenant token with no refresh. */
  accessToken: z.string().optional(),
  expiresAt: z.date().or(z.string()).optional(),
});
export type ImpersonationSessionResponse = z.infer<
  typeof ImpersonationSessionResponseSchema
>;
