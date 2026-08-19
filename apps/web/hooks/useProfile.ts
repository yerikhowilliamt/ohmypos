'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UserResponse } from '@ohmypos/api-contracts';
import { apiFetch } from '@/lib/api';

export const PROFILE_QUERY_KEYS = {
  me: ['profile', 'me'] as const,
};

export function useCurrentUser() {
  return useQuery({
    queryKey: PROFILE_QUERY_KEYS.me,
    queryFn: () => apiFetch<UserResponse>('/auth/me'),
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string }) =>
      apiFetch<UserResponse>('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEYS.me });
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (data: { oldPassword: string; newPassword: string }) =>
      apiFetch<{ message: string }>('/auth/password', {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
  });
}

export function useDeactivateSelf() {
  return useMutation({
    mutationFn: () =>
      apiFetch<{ message: string }>('/auth/deactivate', {
        method: 'PATCH',
      }),
  });
}
