import { z } from 'zod';
import { MoneyString, UuidString } from './primitives';

/** Mirrors the `TenantStatus` enum in `schema.prisma` (ADR-025). */
export const TenantStatusSchema = z.enum(['ACTIVE', 'SUSPENDED']);
export type TenantStatus = z.infer<typeof TenantStatusSchema>;

/** Human-readable tenant identifier. Never a routing key (ADR-025 Decision 2). */
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

/** Creates a tenant and its first OWNER in one transaction (ADR-025 Decision 7). */
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

/** Partial: rename and suspend share this endpoint. */
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

/** Tenant list row with usage counts. */
export const TenantListItemSchema = TenantResponseSchema.extend({
  userCount: z.number().int(),
  branchCount: z.number().int(),
  saleCount: z.number().int(),
});
export type TenantListItem = z.infer<typeof TenantListItemSchema>;

/** `grossRevenue` excludes voided sales (DEBT-010). */
export const TenantDetailResponseSchema = TenantListItemSchema.extend({
  /** The oldest active OWNER, or null. Used to target owner-recovery calls. */
  ownerId: UuidString.nullable(),
  ownerEmail: z.string().nullable(),
  /** True when the tenant holds nothing beyond what provisioning created. */
  isPristine: z.boolean(),
  rawMaterialCount: z.number().int(),
  productCount: z.number().int(),
  grossRevenue: MoneyString,
  lastSaleAt: z.date().or(z.string()).nullable(),
});
export type TenantDetailResponse = z.infer<typeof TenantDetailResponseSchema>;
