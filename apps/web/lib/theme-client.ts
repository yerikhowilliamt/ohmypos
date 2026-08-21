import { THEME_COOKIE_NAME, type Theme } from './theme';

/** Client-only — writes the theme cookie so the next server request (a hard
 * reload, or a fresh layout mount) can read it back via `getInitialTheme()`.
 * No sensitive data, so a plain non-HttpOnly cookie is fine. */
export function persistThemeCookie(theme: Theme): void {
  document.cookie = `${THEME_COOKIE_NAME}=${theme}; path=/; max-age=31536000; SameSite=Lax`;
}
