import { z } from 'zod';
import { MoneyString, UuidString } from './primitives';

/** Mirrors the `TenantStatus` enum in `schema.prisma` (ADR-025). */
export const TenantStatusSchema = z.enum(['ACTIVE', 'SUSPENDED']);
export type TenantStatus = z.infer<typeof TenantStatusSchema>;

/**
 * How a platform operator recognises a tenant in a list. Explicitly NOT a
 * routing key — the tenant is resolved from the User record, never from the
 * client (ADR-025 Decision 2) — so the only real constraints are that it is
 * readable and stable.
 */
export const TenantSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, 'Slug minimal 2 karakter')
  .max(40, 'Slug maksimal 40 karakter')
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Slug hanya boleh berisi huruf kecil, angka, dan tanda hubung tunggal di antaranya',
  );

/**
 * ADR-025 Decision 7 — creating a tenant also creates its first OWNER, in the
 * same transaction. A tenant with no owner cannot be logged into and there is
 * no self-registration to fix that afterwards, so the two are one operation
 * rather than two endpoints an operator could half-complete.
 *
 * The owner shape mirrors `CreateUserSchema` minus `role` and `branchId`: the
 * role is always OWNER, and ADR-011 §2 requires an OWNER to have no branch.
 */
export const CreateTenantSchema = z.object({
  name: z.string().trim().min(1, 'Nama bisnis wajib diisi').max(120),
  slug: TenantSlugSchema,
  owner: z.object({
    name: z.string().trim().min(1, 'Nama owner wajib diisi').max(120),
    email: z.email().toLowerCase(),
    /** Same rule as `CreateUserSchema`: length only, no composition rules. */
    password: z.string().min(8).max(200),
  }),
});
export type CreateTenant = z.infer<typeof CreateTenantSchema>;

/**
 * Partial on purpose: suspending a tenant and renaming one are the same
 * endpoint, and an operator suspending a business should not have to resend
 * its name to do it.
 */
export const UpdateTenantSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  slug: TenantSlugSchema.optional(),
  status: TenantStatusSchema.optional(),
});
export type UpdateTenant = z.infer<typeof UpdateTenantSchema>;

export const TenantResponseSchema = z.object({
  id: UuidString,
  name: z.string(),
  slug: z.string(),
  status: TenantStatusSchema,
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
});
export type TenantResponse = z.infer<typeof TenantResponseSchema>;

/**
 * The list row. Counts come from the same query that builds the page, so the
 * operator can tell a live business from an abandoned one without opening each
 * tenant in turn — which is the entire job of this screen.
 */
export const TenantListItemSchema = TenantResponseSchema.extend({
  userCount: z.number().int(),
  branchCount: z.number().int(),
  saleCount: z.number().int(),
});
export type TenantListItem = z.infer<typeof TenantListItemSchema>;

/**
 * `grossRevenue` excludes voided sales, matching how every report in
 * `reports.service.ts` defines revenue (DEBT-010). `lastSaleAt` is null for a
 * tenant that has never recorded one — which, for a newly provisioned tenant,
 * is the number an operator actually wants to see.
 */
export const TenantDetailResponseSchema = TenantListItemSchema.extend({
  ownerEmail: z.string().nullable(),
  rawMaterialCount: z.number().int(),
  productCount: z.number().int(),
  grossRevenue: MoneyString,
  lastSaleAt: z.date().or(z.string()).nullable(),
});
export type TenantDetailResponse = z.infer<typeof TenantDetailResponseSchema>;
