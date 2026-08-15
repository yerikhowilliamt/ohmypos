import type { UserRole } from '@ohmypos/api-contracts';

/**
 * JWT claims. Role and branch are embedded so RoleGuard and BranchScopeGuard
 * can decide without a database round-trip on every request (ADR-011 §4).
 * `branchId` is null for ADMIN and OWNER.
 */
export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  branchId: string | null;
  iat?: number;
  exp?: number;
}
