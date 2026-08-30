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
  /**
   * ADR-025 — informational only. Like `role` and `branchId`, the value the
   * request actually runs under is re-read from the database by JwtAuthGuard;
   * this claim is never the source of truth.
   */
  tenantId?: string;
  /**
   * ADR-025 Decision 8 — present ONLY on a token minted by
   * `POST /platform/tenants/:id/impersonate`. Its presence is what makes the
   * session read-only (`ImpersonationReadOnlyGuard`) and what lets the frontend
   * show a permanent banner.
   *
   * Unlike `role` and `branchId`, this claim IS the source of truth: there is
   * no row to re-read it from, because impersonation is a property of the token
   * rather than of the borrowed user. It is safe because the token is signed —
   * a caller cannot remove the claim to escape read-only without invalidating
   * the signature, and a caller cannot add it either.
   */
  imp?: { sessionId: string; platformAdminId: string };
  iat?: number;
  exp?: number;
}
