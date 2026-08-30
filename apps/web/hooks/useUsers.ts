'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateUser,
  UpdateUser,
  UserResponse,
} from '@ohmypos/api-contracts';
import { apiFetch } from '@/lib/api';

export const USERS_QUERY_KEYS = {
  users: ['users'] as const,
};

export function useUsers() {
  return useQuery({
    queryKey: USERS_QUERY_KEYS.users,
    queryFn: () => apiFetch<UserResponse[]>('/users'),
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateUser) =>
      apiFetch<UserResponse>('/users', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEYS.users });
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateUser }) =>
      apiFetch<UserResponse>(`/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEYS.users });
    },
  });
}

export function useDeactivateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<UserResponse>(`/users/${id}/deactivate`, {
        method: 'PATCH',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEYS.users });
    },
  });
}

/**
 * TASK-130 — an OWNER setting a staff member's password for them.
 *
 * Nothing is invalidated on success, and that is deliberate rather than an
 * omission: no field the table renders changes, because a password never
 * appears in any response. The server's message is the whole result.
 */
export function useResetUserPassword() {
  return useMutation({
    mutationFn: ({ id, newPassword }: { id: string; newPassword: string }) =>
      apiFetch<{ message: string }>(`/users/${id}/password`, {
        method: 'PATCH',
        body: JSON.stringify({ newPassword }),
      }),
  });
}

export function useReactivateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<UserResponse>(`/users/${id}/reactivate`, {
        method: 'PATCH',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEYS.users });
    },
  });
}
