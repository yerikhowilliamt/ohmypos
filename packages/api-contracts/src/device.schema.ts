import { z } from 'zod';
import { DateTimeString, UuidString } from './primitives';
import {
  PaginationMetaSchema,
  PaginationQuerySchema,
  SortOrderSchema,
} from './pagination.schema';

export const CreateDeviceSchema = z.object({
  branchId: UuidString,
  label: z.string().trim().min(1).max(120),
});
export type CreateDevice = z.infer<typeof CreateDeviceSchema>;

/** `branchId` cannot change on an active device; deactivate first (ADR-021). */
export const UpdateDeviceSchema = CreateDeviceSchema.partial();
export type UpdateDevice = z.infer<typeof UpdateDeviceSchema>;

export const ActivateDeviceSchema = z.object({
  code: z.string().min(1),
});
export type ActivateDevice = z.infer<typeof ActivateDeviceSchema>;

export const DeviceResponseSchema = z.object({
  id: UuidString,
  branchId: UuidString,
  label: z.string(),
  isActive: z.boolean(),
  activatedByUserId: UuidString.nullable(),
  activatedAt: z.date().or(z.string()).nullable(),
  activationCode: z.string().nullable(),
  activationCodeExpiresAt: z.date().or(z.string()).nullable(),
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
});
export type DeviceResponse = z.infer<typeof DeviceResponseSchema>;

export const AttendanceViolationReason = z.enum([
  'NO_DEVICE_COOKIE',
  'DEVICE_NOT_REGISTERED',
  'DEVICE_WRONG_BRANCH',
  'DEVICE_INACTIVE',
]);
export type AttendanceViolationReason = z.infer<
  typeof AttendanceViolationReason
>;

export const AttendanceStatusSchema = z.object({
  isValid: z.boolean(),
  violationReason: AttendanceViolationReason.nullable(),
});
export type AttendanceStatus = z.infer<typeof AttendanceStatusSchema>;

export const UpdateAttendanceStatusSchema = z.object({
  isValid: z.boolean(),
  violationReason: AttendanceViolationReason.nullable().optional(),
});
export type UpdateAttendanceStatus = z.infer<
  typeof UpdateAttendanceStatusSchema
>;

export const AttendanceRecordResponseSchema = z.object({
  id: UuidString,
  userId: UuidString,
  userName: z.string(),
  userEmail: z.string(),
  branchId: UuidString.nullable(),
  branchName: z.string().nullable(),
  deviceId: UuidString.nullable(),
  deviceLabel: z.string().nullable(),
  loginAt: z.date().or(z.string()),
  isValid: z.boolean(),
  violationReason: AttendanceViolationReason.nullable(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: z.date().or(z.string()),
});
export type AttendanceRecordResponse = z.infer<
  typeof AttendanceRecordResponseSchema
>;

/** Must list every sortable column of the attendance table. */
export const AttendanceSortBySchema = z.enum([
  'loginAt',
  'userName',
  'branchName',
  'deviceLabel',
  'isValid',
  'createdAt',
]);
export type AttendanceSortBy = z.infer<typeof AttendanceSortBySchema>;

/** `startDate`/`endDate` filter `loginAt`, never `createdAt`. */
export const AttendanceQuerySchema = PaginationQuerySchema.extend({
  /** Matches name, email, branch or device label (DEBT-052). */
  search: z.string().trim().optional(),
  branchId: UuidString.optional(),
  violationOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => val === 'true'),
  startDate: DateTimeString.optional(),
  endDate: DateTimeString.optional(),
  sortBy: AttendanceSortBySchema.optional(),
  sortOrder: SortOrderSchema.optional(),
  /** Up to one month per page for the calendar matrix (raises the default cap of 100). */
  limit: z.coerce.number().int().min(1).max(500).default(50),
});
export type AttendanceQuery = z.infer<typeof AttendanceQuerySchema>;

export const AttendanceListResponseSchema = z.object({
  data: z.array(AttendanceRecordResponseSchema),
  meta: PaginationMetaSchema,
});
export type AttendanceListResponse = z.infer<
  typeof AttendanceListResponseSchema
>;
