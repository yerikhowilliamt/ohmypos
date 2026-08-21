export const THEME_COOKIE_NAME = 'ohmypos-theme';

export type Theme = 'light' | 'dark';

/** Guards a raw cookie value — anything unexpected (missing, corrupted, from
 * a future feature) falls back to light rather than risking a broken theme. */
export function isTheme(value: string | undefined): value is Theme {
  return value === 'light' || value === 'dark';
}
