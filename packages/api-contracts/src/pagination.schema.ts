import { z } from 'zod';

/** Shared query shape for every paginated list endpoint (ported from Kasync). */
export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  sortBy: z.string().optional(),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export const PaginationMetaSchema = z.object({
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
  totalPages: z.number().int(),
});
export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;

/**
 * Sort direction for a paginated list endpoint. Deliberately NOT a field on
 * `PaginationQuerySchema`: a module opts in only once its service actually
 * honours it, so a route can never advertise a parameter it silently drops
 * (which is exactly what `sortOrder` did before this was added — apps/web sent
 * it, Zod stripped it, and the service hardcoded 'desc').
 */
export const SortOrderSchema = z.enum(['asc', 'desc']);
export type SortOrder = z.infer<typeof SortOrderSchema>;
