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

/**
 * `branchId` is accepted here but the API refuses it on an ACTIVE device: a
 * device's branch is an access-control input — `AuthService` matches a
 * cashier's branch against it — so re-pointing a live terminal would change
 * who may log in from it without the physical re-activation ceremony ADR-021
 * is built around. Deactivate first, move, re-activate at the terminal.
 */
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

/**
 * Every column AttendanceLogTable renders a SortableHeader for must appear
 * here. A sortable-looking header the API cannot order by is a control that
 * lies: the arrow moves, the rows do not.
 */
export const AttendanceSortBySchema = z.enum([
  'loginAt',
  'userName',
  'branchName',
  'deviceLabel',
  'isValid',
  'createdAt',
]);
export type AttendanceSortBy = z.infer<typeof AttendanceSortBySchema>;

/**
 * `startDate`/`endDate` filter `loginAt`, never `createdAt`. Both columns
 * default to now() and are therefore equal in production, so a filter on the
 * wrong one would pass every test written against real data — `loginAt` is the
 * column the calendar reads and the one that carries meaning.
 *
 * Before these bounds existed the endpoint could only answer "the N most recent
 * logins", while AttendanceCalendarMatrix filtered client-side to the month on
 * screen. The month never reached the server, so navigating to an earlier month
 * matched nothing and rendered every cell blank — indistinguishable from nobody
 * having logged in at all.
 */
export const AttendanceQuerySchema = PaginationQuerySchema.extend({
  /**
   * Matches employee name, employee email, branch name or device label. Email
   * is searchable without being a table column because the Karyawan cell
   * already renders it underneath the name (DEBT-052).
   */
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
  /**
   * Overrides PaginationQuerySchema's max of 100. The calendar matrix asks for
   * one whole month in a single page: 8 kasir x 2 logins x 31 days = 496 rows.
   * A month past this cap is not silently truncated — the matrix compares
   * `meta.total` against the rows it received and says so on screen, because a
   * missing attendance cell reads as "absent", not as "not loaded".
   */
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
