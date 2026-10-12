import type { PlatformAdminResponse } from '@ohmypos/api-contracts';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { API_BASE_URL } from './api';

/** Platform admin session lookup, kept separate from `getSession()` (a platform admin is not a `User`). */
export async function getPlatformSession(): Promise<PlatformAdminResponse | null> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  if (!cookieHeader) return null;

  try {
    const res = await fetch(`${API_BASE_URL}/platform/auth/me`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as PlatformAdminResponse;
  } catch {
    // API unreachable — treat as signed out rather than crashing the render.
    return null;
  }
}

/** Gates `/platform` pages. UX only: `PlatformAuthGuard` is the authority. */
export async function requirePlatformAdmin(): Promise<PlatformAdminResponse> {
  const admin = await getPlatformSession();

  if (!admin) {
    redirect('/platform/login');
  }

  return admin;
}
