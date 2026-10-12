'use client';

import { useMutation } from '@tanstack/react-query';
import type { PlatformAdminChangePassword } from '@ohmypos/api-contracts';
import { apiFetch } from '@/lib/api';

/** Platform admin password change. No invalidation: the session was just revoked. */
export function usePlatformChangePassword() {
  return useMutation({
    mutationFn: (data: PlatformAdminChangePassword) =>
      apiFetch<{ message: string }>('/platform/auth/password', {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
  });
}
