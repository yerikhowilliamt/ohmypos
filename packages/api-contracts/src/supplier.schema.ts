import { z } from 'zod';
import { DateTimeString, UuidString } from './primitives';
import { PaginationQuerySchema } from './pagination.schema';

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
    .min(1, 'Name is required')
    .max(100, 'Name is too long'),
  contact: z.string().trim().max(255, 'Contact is too long').optional(),
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
});
export type SupplierQuery = z.infer<typeof SupplierQuerySchema>;
