import { z } from 'zod';
import { AttendanceStatusSchema } from './device.schema';
import { TenantStatusSchema } from './tenant.schema';
import { UserResponseSchema } from './user.schema';

/** Auth shapes. There is no register schema: users are created by an OWNER (ADR-011). */
export const LoginSchema = z.object({
  email: z.email().toLowerCase(),
  password: z.string().min(1, 'Kata sandi wajib diisi'),
});
export type Login = z.infer<typeof LoginSchema>;

export const ChangePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});
export type ChangePassword = z.infer<typeof ChangePasswordSchema>;

/** Login response: `UserResponse` plus attendance (null for ADMIN/OWNER). */
export const LoginResponseSchema = UserResponseSchema.extend({
  attendance: AttendanceStatusSchema.nullable(),
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

/** `GET /auth/me`: `UserResponse` plus `tenantStatus` (TASK-132). */
export const SessionResponseSchema = UserResponseSchema.extend({
  tenantStatus: TenantStatusSchema,
});
export type SessionResponse = z.infer<typeof SessionResponseSchema>;

/** Self-service profile update: name only. Email changes go through `PATCH /users/:id`. */
export const UpdateSelfSchema = z.object({
  name: z.string().trim().min(1).max(120),
});
export type UpdateSelf = z.infer<typeof UpdateSelfSchema>;

/** Response of `POST /auth/me/photo`. */
export const UploadPhotoResponseSchema = z.object({
  photoUrl: z.string(),
});
export type UploadPhotoResponse = z.infer<typeof UploadPhotoResponseSchema>;
