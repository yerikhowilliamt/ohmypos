import { z } from 'zod';
import { UuidString } from './primitives';

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
    message: 'endDate must not precede startDate',
    path: ['endDate'],
  });
export type CreateLeaveRequest = z.infer<typeof CreateLeaveRequestSchema>;

export const LeaveRequestListQuerySchema = z.object({
  status: LeaveRequestStatus.optional(),
  userId: UuidString.optional(),
});
export type LeaveRequestListQuery = z.infer<typeof LeaveRequestListQuerySchema>;

export const LeaveRequestResponseSchema = z.object({
  id: UuidString,
  userId: UuidString,
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
