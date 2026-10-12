export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';
export const DEVICE_COOKIE = 'ohmypos_device';

const isProduction = process.env.NODE_ENV === 'production';

/** HttpOnly. Production is cross-origin, so it needs `sameSite: 'none'` with `secure`. */
export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction,
  sameSite: (isProduction ? 'none' : 'lax') as 'none' | 'lax' | 'strict',
  path: '/',
};

export const ACCESS_TOKEN_MAX_AGE = 24 * 60 * 60 * 1000; // 1 day
export const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days
/** A physical terminal's identity, not a session. */
export const DEVICE_COOKIE_MAX_AGE = 5 * 365 * 24 * 60 * 60 * 1000; // ~5 years

/** Distinct names keep platform and tenant sessions independent in one browser. */
export const PLATFORM_ACCESS_TOKEN_COOKIE = 'platform_access_token';
export const PLATFORM_REFRESH_TOKEN_COOKIE = 'platform_refresh_token';

/** Shorter than tenant sessions: this session reaches every tenant. */
export const PLATFORM_ACCESS_TOKEN_MAX_AGE = 2 * 60 * 60 * 1000; // 2 hours
export const PLATFORM_REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
