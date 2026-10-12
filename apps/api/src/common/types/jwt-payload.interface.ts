import type { UserRole } from '@ohmypos/api-contracts';

/**
 * Tenant JWT claims. `role`, `branchId` and `tenantId` are overwritten from the
 * database by `JwtAuthGuard`; the token values are never trusted.
 */
export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  branchId: string | null;
  /** Informational only; re-read from the database. */
  tenantId?: string;
  /**
   * Present only on impersonation tokens, making the session read-only. The
   * signed claim itself is the source of truth.
   */
  imp?: { sessionId: string; platformAdminId: string };
  iat?: number;
  exp?: number;
}
