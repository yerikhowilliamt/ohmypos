'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AccountResponse,
  CreateAccount,
  UpdateAccount,
} from '@ohmypos/api-contracts';
import { apiFetch } from '@/lib/api';

export const ACCOUNTS_QUERY_KEYS = {
  accounts: ['accounts'] as const,
};

export function useAccounts() {
  return useQuery({
    queryKey: ACCOUNTS_QUERY_KEYS.accounts,
    queryFn: () => apiFetch<AccountResponse[]>('/accounts'),
  });
}

export function useCreateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateAccount) =>
      apiFetch<AccountResponse>('/accounts', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ACCOUNTS_QUERY_KEYS.accounts,
      });
    },
  });
}

export function useUpdateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAccount }) =>
      apiFetch<AccountResponse>(`/accounts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ACCOUNTS_QUERY_KEYS.accounts,
      });
    },
  });
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/accounts/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ACCOUNTS_QUERY_KEYS.accounts,
      });
    },
  });
}
