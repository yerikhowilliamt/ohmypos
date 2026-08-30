export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';
export const DEVICE_COOKIE = 'ohmypos_device';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Ported from Kasync. HttpOnly keeps the token out of reach of any script.
 * In production (cross-origin between Vercel FE and Render BE), sameSite must be 'none' with secure: true.
 */
export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction,
  sameSite: (isProduction ? 'none' : 'lax') as 'none' | 'lax' | 'strict',
  path: '/',
};

export const ACCESS_TOKEN_MAX_AGE = 24 * 60 * 60 * 1000; // 1 day
export const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days
/** Long-lived — this cookie represents a physical terminal's identity, not a session (Phase 11). */
export const DEVICE_COOKIE_MAX_AGE = 5 * 365 * 24 * 60 * 60 * 1000; // ~5 years

/**
 * ADR-025 Fase 3 — the platform admin's session is carried on its own cookie
 * names, signed with its own secret pair.
 *
 * Separate names, not a separate path: a browser sends every cookie whose path
 * prefixes the request, so reusing `access_token` would mean an operator with
 * both sessions open sends two values under one name and the server reads
 * whichever the browser happened to order first. Distinct names make the two
 * sessions independent, which is also what lets an operator impersonate a
 * tenant in one tab while staying signed in to the platform console.
 */
export const PLATFORM_ACCESS_TOKEN_COOKIE = 'platform_access_token';
export const PLATFORM_REFRESH_TOKEN_COOKIE = 'platform_refresh_token';

/**
 * Deliberately shorter than the tenant session's 1 day / 30 days. This session
 * can read and suspend every tenant in the system, so an unattended browser is
 * a much larger blast radius than one shop's till.
 */
export const PLATFORM_ACCESS_TOKEN_MAX_AGE = 2 * 60 * 60 * 1000; // 2 hours
export const PLATFORM_REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
