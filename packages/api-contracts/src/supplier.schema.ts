import { z } from 'zod';
import { DateTimeString, UuidString } from './primitives';
import { PaginationQuerySchema, SortOrderSchema } from './pagination.schema';

/**
 * OhMyPos — Supplier contracts (ERD §3, PRD §5.3).
 *
 * Contact is free-text (phone, WhatsApp, or contact person name) and is not
 * validated as a strict phone format because Indonesian supplier contacts vary.
 */
export const CreateSupplierSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Nama pemasok wajib diisi')
    .max(100, 'Nama pemasok maksimal 100 karakter'),
  contact: z
    .string()
    .trim()
    .max(255, 'Kontak maksimal 255 karakter')
    .optional(),
});
export type CreateSupplier = z.infer<typeof CreateSupplierSchema>;

export const UpdateSupplierSchema = CreateSupplierSchema.partial();
export type UpdateSupplier = z.infer<typeof UpdateSupplierSchema>;

export const SupplierResponseSchema = z.object({
  id: UuidString,
  name: z.string(),
  contact: z.string().nullable(),
  createdAt: DateTimeString,
  updatedAt: DateTimeString,
});
export type SupplierResponse = z.infer<typeof SupplierResponseSchema>;

export const SupplierSortBySchema = z.enum(['name', 'createdAt']);
export type SupplierSortBy = z.infer<typeof SupplierSortBySchema>;

export const SupplierQuerySchema = PaginationQuerySchema.extend({
  search: z.string().trim().optional(),
  sortBy: SupplierSortBySchema.optional(),
  sortOrder: SortOrderSchema.optional(),
});
export type SupplierQuery = z.infer<typeof SupplierQuerySchema>;
