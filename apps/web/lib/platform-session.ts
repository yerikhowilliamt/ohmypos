import type { PlatformAdminResponse } from '@ohmypos/api-contracts';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { API_BASE_URL } from './api';

/**
 * ADR-025 Decision 5 — the platform console's mirror of `lib/session.ts`.
 *
 * Deliberately a separate file with a separate return type rather than a
 * `role: 'SUPER_ADMIN'` branch inside `getSession()`. A platform admin is not a
 * `User`, has no tenant and no branch, and the single most common multi-tenant
 * leak is a code path where "no tenant" quietly means "every tenant". Keeping
 * the two lookups apart means that path cannot be written by accident here
 * either.
 */
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

/**
 * Gates the `/platform` console. As with `requireRole`, this is a UX
 * convenience: `PlatformAuthGuard` in `apps/api` is the authoritative check,
 * and this function is never the only thing between an operator and the data.
 */
export async function requirePlatformAdmin(): Promise<PlatformAdminResponse> {
  const admin = await getPlatformSession();

  if (!admin) {
    redirect('/platform/login');
  }

  return admin;
}
