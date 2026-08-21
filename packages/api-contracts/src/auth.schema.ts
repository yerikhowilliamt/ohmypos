import { z } from 'zod';
import { AttendanceStatusSchema } from './device.schema';
import { UserResponseSchema } from './user.schema';

/**
 * Auth request/response shapes (ADR-011 §3). There is deliberately no register
 * schema: user creation is OWNER-only, with no self-registration (ADR-011 §5).
 */
export const LoginSchema = z.object({
  email: z.email().toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});
export type Login = z.infer<typeof LoginSchema>;

export const ChangePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});
export type ChangePassword = z.infer<typeof ChangePasswordSchema>;

/**
 * Additive over UserResponseSchema (Phase 11) — `attendance` is null for
 * ADMIN/OWNER (not tracked, Context section) and for any login response that
 * isn't the login endpoint itself (GET /auth/me, PATCH /users/:id, etc. all
 * still return plain UserResponseSchema, not this). Frontend code that only
 * reads name/email/role from a login response is unaffected by this field.
 */
export const LoginResponseSchema = UserResponseSchema.extend({
  attendance: AttendanceStatusSchema.nullable(),
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

/**
 * Self-service profile update (Phase 10a). Deliberately name-only: email is
 * the login identifier and changing it is an OWNER-administered action via
 * `PATCH /users/:id`, not a self-service one — there is no self-service email
 * change in this plan.
 */
export const UpdateSelfSchema = z.object({
  name: z.string().trim().min(1).max(120),
});
export type UpdateSelf = z.infer<typeof UpdateSelfSchema>;

/** Response shape of POST /auth/me/photo (Phase 10b). */
export const UploadPhotoResponseSchema = z.object({
  photoUrl: z.string(),
});
export type UploadPhotoResponse = z.infer<typeof UploadPhotoResponseSchema>;
