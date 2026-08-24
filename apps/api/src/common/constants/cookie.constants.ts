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
