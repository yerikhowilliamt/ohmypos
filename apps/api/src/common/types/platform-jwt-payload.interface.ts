/**
 * ADR-025 Decision 5 — a platform admin is NOT a `User`, so its token is not a
 * `JwtPayload` with an extra role. The two payload shapes stay separate types
 * signed with separate secrets, which is what makes "a tenant token presented
 * to a platform route" fail at signature verification rather than at a role
 * check someone could forget to write.
 *
 * There is no `role` claim: every platform admin has the same powers, and a
 * privilege split inside the platform console would be its own ADR.
 */
export interface PlatformJwtPayload {
  sub: string;
  email: string;
  iat?: number;
  exp?: number;
}
