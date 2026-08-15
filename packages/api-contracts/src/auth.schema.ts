import { z } from 'zod';
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

/** Tokens travel in HttpOnly cookies, never in the body — only the user is returned. */
export const LoginResponseSchema = UserResponseSchema;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
