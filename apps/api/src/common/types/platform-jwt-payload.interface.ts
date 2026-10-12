/**
 * Platform admin JWT claims; a separate type and secret from `JwtPayload`
 * (ADR-025 Decision 5). No roles: every platform admin has the same powers.
 */
export interface PlatformJwtPayload {
  sub: string;
  email: string;
  iat?: number;
  exp?: number;
}
