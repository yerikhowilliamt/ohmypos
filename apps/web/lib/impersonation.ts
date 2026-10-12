import { cookies } from 'next/headers';

/**
 * Impersonation from the platform console (ADR-025 Decision 8). The token comes
 * back in the response body; `app/api/platform/impersonation/route.ts` moves it
 * into the HttpOnly `access_token` cookie server-side.
 */
export const ACCESS_TOKEN_COOKIE = 'access_token';

/**
 * Non-HttpOnly marker that only tells the shell to show the banner. Forgeable
 * by design: read-only is enforced by the API on the signed `imp` claim.
 */
export const IMPERSONATION_COOKIE = 'ohmypos_impersonation';

/** Matches the token's own 30-minute TTL, so the two expire together. */
export const IMPERSONATION_MAX_AGE_SECONDS = 30 * 60;

/** Server-side read, for the tenant layout that decides whether to show the banner. */
export async function getImpersonationLabel(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(IMPERSONATION_COOKIE)?.value ?? null;
}
