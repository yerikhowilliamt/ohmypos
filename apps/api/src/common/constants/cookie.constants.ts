export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';
export const DEVICE_COOKIE = 'ohmypos_device';

/** Ported from Kasync. HttpOnly keeps the token out of reach of any script. */
export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
};

export const ACCESS_TOKEN_MAX_AGE = 24 * 60 * 60 * 1000; // 1 day
export const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days
/** Long-lived — this cookie represents a physical terminal's identity, not a session (Phase 11). */
export const DEVICE_COOKIE_MAX_AGE = 5 * 365 * 24 * 60 * 60 * 1000; // ~5 years
