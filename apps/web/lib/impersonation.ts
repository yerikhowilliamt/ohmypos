import { cookies } from 'next/headers';

/**
 * ADR-025 Decision 8 — browsing a tenant as its OWNER, from the platform
 * console.
 *
 * The API hands the impersonation token back in the RESPONSE BODY rather than
 * as a cookie, because it is minted by a platform route while the token it
 * mints is a tenant one. Something has to move it into the `access_token`
 * cookie the tenant app reads, and that something cannot be browser JavaScript:
 * the cookie is HttpOnly. `app/api/platform/impersonation/route.ts` does it
 * server-side instead.
 */
export const ACCESS_TOKEN_COOKIE = 'access_token';

/**
 * A SECOND, deliberately non-HttpOnly cookie set beside the token, purely so
 * the tenant shell knows to render the banner.
 *
 * It is a UI hint and nothing more. The read-only enforcement lives in
 * `ImpersonationReadOnlyGuard` in `apps/api`, keyed on the signed `imp` claim
 * inside the token — which is why it does not matter that this marker is
 * forgeable. The worst a user can do by setting it themselves is show
 * themselves a banner. The alternative — decoding the JWT here — would mean
 * shipping the tenant signing secret to the web app, which is a genuinely bad
 * trade for a piece of chrome.
 */
export const IMPERSONATION_COOKIE = 'ohmypos_impersonation';

/** Matches the token's own 30-minute TTL, so the two expire together. */
export const IMPERSONATION_MAX_AGE_SECONDS = 30 * 60;

/** Server-side read, for the tenant layout that decides whether to show the banner. */
export async function getImpersonationLabel(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(IMPERSONATION_COOKIE)?.value ?? null;
}
