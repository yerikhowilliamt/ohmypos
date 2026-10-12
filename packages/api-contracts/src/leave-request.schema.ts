import { z } from 'zod';
import { UuidString } from './primitives';
import {
  PaginationMetaSchema,
  PaginationQuerySchema,
  SortOrderSchema,
} from './pagination.schema';

/** `YYYY-MM-DD`, same convention as ReportRangeQuerySchema's ReportDate. */
const LeaveDate = z.iso.date();

export const LeaveRequestStatus = z.enum(['PENDING', 'APPROVED', 'REJECTED']);
export type LeaveRequestStatus = z.infer<typeof LeaveRequestStatus>;

export const CreateLeaveRequestSchema = z
  .object({
    startDate: LeaveDate,
    endDate: LeaveDate,
    reason: z.string().trim().min(1).max(500),
  })
  .refine((v) => v.startDate <= v.endDate, {
    message: 'Tanggal selesai tidak boleh sebelum tanggal mulai',
    path: ['endDate'],
  });
export type CreateLeaveRequest = z.infer<typeof CreateLeaveRequestSchema>;

export const LeaveRequestSortBySchema = z.enum([
  'createdAt',
  'startDate',
  'endDate',
  'status',
]);
export type LeaveRequestSortBy = z.infer<typeof LeaveRequestSortBySchema>;

/** `overlapsFrom`/`overlapsTo` match by overlap, not containment. */
export const LeaveRequestListQuerySchema = PaginationQuerySchema.extend({
  status: LeaveRequestStatus.optional(),
  userId: UuidString.optional(),
  overlapsFrom: LeaveDate.optional(),
  overlapsTo: LeaveDate.optional(),
  sortBy: LeaveRequestSortBySchema.optional(),
  sortOrder: SortOrderSchema.optional(),
  /** Up to one month per page, aligned with the attendance calendar (ERR-047). */
  limit: z.coerce.number().int().min(1).max(500).default(50),
});
export type LeaveRequestListQuery = z.infer<typeof LeaveRequestListQuerySchema>;

export const LeaveRequestUserSummarySchema = z.object({
  id: UuidString,
  name: z.string(),
  email: z.string(),
});
export type LeaveRequestUserSummary = z.infer<
  typeof LeaveRequestUserSummarySchema
>;

export const LeaveRequestResponseSchema = z.object({
  id: UuidString,
  userId: UuidString,
  user: LeaveRequestUserSummarySchema.optional(),
  startDate: z.string(),
  endDate: z.string(),
  reason: z.string(),
  status: LeaveRequestStatus,
  reviewedByUserId: UuidString.nullable(),
  reviewedAt: z.date().or(z.string()).nullable(),
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
});
export type LeaveRequestResponse = z.infer<typeof LeaveRequestResponseSchema>;

export const LeaveRequestListResponseSchema = z.object({
  data: z.array(LeaveRequestResponseSchema),
  meta: PaginationMetaSchema,
});
export type LeaveRequestListResponse = z.infer<
  typeof LeaveRequestListResponseSchema
>;
