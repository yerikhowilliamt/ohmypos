'use client';

import { useMutation } from '@tanstack/react-query';
import type { PlatformAdminChangePassword } from '@ohmypos/api-contracts';
import { apiFetch } from '@/lib/api';

/**
 * TASK-130 — the platform console's own password change. The mirror of
 * `useChangePassword` in `useProfile.ts`, against `/platform/auth/password`.
 *
 * Nothing is invalidated on success, and that is not an omission: the server
 * has just revoked this session, so the next query would 401 rather than
 * refetch. The caller redirects to `/platform/login` instead.
 */
export function usePlatformChangePassword() {
  return useMutation({
    mutationFn: (data: PlatformAdminChangePassword) =>
      apiFetch<{ message: string }>('/platform/auth/password', {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
  });
}
