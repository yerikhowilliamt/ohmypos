'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BranchResponse,
  CreateBranch,
  UpdateBranch,
} from '@ohmypos/api-contracts';
import { apiFetch } from '@/lib/api';

export const BRANCHES_QUERY_KEYS = {
  branches: ['branches'] as const,
};

export function useBranches() {
  return useQuery({
    queryKey: BRANCHES_QUERY_KEYS.branches,
    queryFn: () => apiFetch<BranchResponse[]>('/branches'),
  });
}

export function useCreateBranch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBranch) =>
      apiFetch<BranchResponse>('/branches', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: BRANCHES_QUERY_KEYS.branches,
      });
    },
  });
}

export function useUpdateBranch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateBranch }) =>
      apiFetch<BranchResponse>(`/branches/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: BRANCHES_QUERY_KEYS.branches,
      });
    },
  });
}

export function useDeleteBranch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/branches/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: BRANCHES_QUERY_KEYS.branches,
      });
    },
  });
}
