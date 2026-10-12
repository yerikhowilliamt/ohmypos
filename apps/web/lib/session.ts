import type { SessionResponse, UserResponse } from '@ohmypos/api-contracts';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { API_BASE_URL } from './api';
import { isTheme, THEME_COOKIE_NAME, type Theme } from './theme';

/** Server-side session lookup via the API (the proxy only sees the cookie). */
export async function getSession(): Promise<SessionResponse | null> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  if (!cookieHeader) return null;

  try {
    const res = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as SessionResponse;
  } catch {
    // API unreachable — treat as signed out rather than crashing the render.
    return null;
  }
}

/** Gates a route group by role. UX only: the API guards are the authority. */
export async function requireRole(
  allowed: Array<UserResponse['role']>,
): Promise<SessionResponse> {
  const user = await getSession();

  if (!user) {
    redirect('/login');
  }

  if (!allowed.includes(user.role)) {
    redirect(user.role === 'KASIR' ? '/sales' : '/master-data');
  }

  return user;
}

/** Server-side read of the persisted theme preference, used to render
 * back-office pages in the right theme on the first paint (no flash). */
export async function getInitialTheme(): Promise<Theme> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(THEME_COOKIE_NAME)?.value;
  return isTheme(raw) ? raw : 'light';
}
