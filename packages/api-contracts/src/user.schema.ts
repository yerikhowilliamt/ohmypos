import { z } from 'zod';
import { UuidString } from './primitives';

/** ADR-011 roles. `CASHIER` is superseded and must not reappear. */
export const UserRole = z.enum(['KASIR', 'ADMIN', 'OWNER']);
export type UserRole = z.infer<typeof UserRole>;

/** KASIR requires a branch; ADMIN/OWNER must have none (ADR-011). */
const branchRule = <
  S extends z.ZodType<{ role: UserRole; branchId?: string | null }>,
>(
  schema: S,
) =>
  schema
    .refine((v) => v.role !== 'KASIR' || Boolean(v.branchId), {
      message: 'Cabang wajib dipilih untuk peran Kasir',
      path: ['branchId'],
    })
    .refine((v) => v.role === 'KASIR' || !v.branchId, {
      message:
        'Admin dan Owner tidak ditugaskan ke satu cabang, jadi cabang harus dikosongkan',
      path: ['branchId'],
    });

export const CreateUserSchema = branchRule(
  z.object({
    name: z.string().trim().min(1).max(120),
    email: z.email().toLowerCase(),
    /** Minimum length only, no composition rules. */
    password: z.string().min(8).max(200),
    role: UserRole,
    branchId: UuidString.nullish(),
  }),
);
export type CreateUser = z.infer<typeof CreateUserSchema>;

/** Partial update. The role/branch rule is checked on the merged state by the service. */
export const UpdateUserSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.email().toLowerCase().optional(),
  role: UserRole.optional(),
  branchId: UuidString.nullish(),
});
export type UpdateUser = z.infer<typeof UpdateUserSchema>;

/** An OWNER sets a staff member's password; no old password (TASK-130). */
export const ResetUserPasswordSchema = z.object({
  newPassword: z.string().min(8).max(200),
});
export type ResetUserPassword = z.infer<typeof ResetUserPasswordSchema>;

export const UserResponseSchema = z.object({
  id: UuidString,
  name: z.string(),
  email: z.string(),
  role: UserRole,
  branchId: UuidString.nullable(),
  isActive: z.boolean(),
  photoUrl: z.string().nullable(),
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
});
export type UserResponse = z.infer<typeof UserResponseSchema>;
