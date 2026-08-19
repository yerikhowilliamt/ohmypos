import { z } from 'zod';
import { UuidString } from './primitives';

export const CreateDeviceSchema = z.object({
  branchId: UuidString,
  label: z.string().trim().min(1).max(120),
});
export type CreateDevice = z.infer<typeof CreateDeviceSchema>;

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

export const AttendanceQuerySchema = z.object({
  branchId: UuidString.optional(),
  violationOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => val === 'true'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type AttendanceQuery = z.infer<typeof AttendanceQuerySchema>;
