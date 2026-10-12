import { z } from 'zod';
import { UuidString } from './primitives';

/** A platform operator corrects a tenant OWNER's login email (TASK-131). */
export const UpdateTenantOwnerEmailSchema = z.object({
  userId: UuidString,
  newEmail: z.email().toLowerCase(),
  reason: z
    .string()
    .trim()
    .min(10, 'Alasan wajib diisi, minimal 10 karakter — ini dicatat permanen')
    .max(500, 'Maksimal 500 karakter'),
  /** Required when the tenant already holds data; ignored for a pristine tenant. */
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
