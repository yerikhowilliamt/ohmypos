import { z } from 'zod';
import { UuidString } from './primitives';

/** ADR-011 §1. `CASHIER` is superseded and must not reappear (Playbook §18). */
export const UserRole = z.enum(['KASIR', 'ADMIN', 'OWNER']);
export type UserRole = z.infer<typeof UserRole>;

/**
 * The branch rule from ADR-011 §2, expressed once so both apps enforce it:
 * a KASIR must have a branch, an ADMIN or OWNER must not. Prisma cannot
 * express this conditional constraint, which is why it lives here.
 */
const branchRule = <
  S extends z.ZodType<{ role: UserRole; branchId?: string | null }>,
>(
  schema: S,
) =>
  schema
    .refine((v) => v.role !== 'KASIR' || Boolean(v.branchId), {
      message: 'branchId is required when role is KASIR',
      path: ['branchId'],
    })
    .refine((v) => v.role === 'KASIR' || !v.branchId, {
      message: 'branchId must be null when role is ADMIN or OWNER',
      path: ['branchId'],
    });

export const CreateUserSchema = branchRule(
  z.object({
    name: z.string().trim().min(1).max(120),
    email: z.email().toLowerCase(),
    /** Minimum length only — no composition rules, which push users to reuse passwords. */
    password: z.string().min(8).max(200),
    role: UserRole,
    branchId: UuidString.nullish(),
  }),
);
export type CreateUser = z.infer<typeof CreateUserSchema>;

/**
 * `role`/`branchId` are optional here (unlike `CreateUserSchema`) because an
 * update may touch only one of the pair — e.g. reassigning a KASIR's branch
 * without changing their role. The branchRule can't be applied at this layer
 * as a result: a partial patch doesn't know the user's *current* role/branchId
 * to validate the merged state against. `UsersService.update` re-runs
 * `assertRoleBranchConsistent` against the merged result instead (Phase 9).
 */
export const UpdateUserSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.email().toLowerCase().optional(),
  role: UserRole.optional(),
  branchId: UuidString.nullish(),
});
export type UpdateUser = z.infer<typeof UpdateUserSchema>;

export const UserResponseSchema = z.object({
  id: UuidString,
  name: z.string(),
  email: z.string(),
  role: UserRole,
  branchId: UuidString.nullable(),
  isActive: z.boolean(),
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
});
export type UserResponse = z.infer<typeof UserResponseSchema>;
