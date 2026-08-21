import type { UserResponse } from '@ohmypos/api-contracts';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { API_BASE_URL } from './api';

/**
 * Server-side session lookup. The proxy only sees whether a cookie exists;
 * this asks the API who the caller actually is, which is the only answer that
 * can be trusted for role gating.
 */
export async function getSession(): Promise<UserResponse | null> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  if (!cookieHeader) return null;

  try {
    const res = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as UserResponse;
  } catch {
    // API unreachable — treat as signed out rather than crashing the render.
    return null;
  }
}

/**
 * Gates a route group by role (System Design §5). This is a UX convenience:
 * the authoritative check is RoleGuard/BranchScopeGuard in apps/api, and this
 * function is never the only thing standing between a user and data.
 */
export async function requireRole(
  allowed: Array<UserResponse['role']>,
): Promise<UserResponse> {
  const user = await getSession();

  if (!user) {
    redirect('/login');
  }

  if (!allowed.includes(user.role)) {
    redirect(user.role === 'KASIR' ? '/sales' : '/master-data');
  }

  return user;
}
