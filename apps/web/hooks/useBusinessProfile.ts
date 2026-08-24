'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BusinessProfileResponse,
  UpdateBusinessProfile,
} from '@ohmypos/api-contracts';
import { apiFetch } from '@/lib/api';

export const BUSINESS_PROFILE_QUERY_KEYS = {
  current: ['business-profile'] as const,
};

export function useBusinessProfile() {
  return useQuery({
    queryKey: BUSINESS_PROFILE_QUERY_KEYS.current,
    queryFn: () => apiFetch<BusinessProfileResponse>('/business-profile'),
  });
}

export function useUpdateBusinessProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateBusinessProfile) =>
      apiFetch<BusinessProfileResponse>('/business-profile', {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: BUSINESS_PROFILE_QUERY_KEYS.current,
      });
    },
  });
}

export function useUploadBusinessLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiFetch<{ logoUrl: string }>('/business-profile/logo', {
        method: 'POST',
        body: formData,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: BUSINESS_PROFILE_QUERY_KEYS.current,
      });
    },
  });
}
