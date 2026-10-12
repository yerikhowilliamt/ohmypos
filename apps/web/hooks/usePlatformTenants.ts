'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateTenant,
  ImpersonationSessionResponse,
  PaginationMeta,
  ResetTenantOwnerPassword,
  StartImpersonation,
  TenantDetailResponse,
  TenantListItem,
  TenantResponse,
  UpdateTenant,
  UpdateTenantOwnerEmail,
  UpdateTenantOwnerEmailResponse,
} from '@ohmypos/api-contracts';
import { apiFetch } from '@/lib/api';

export const PLATFORM_TENANT_QUERY_KEYS = {
  list: (page: number, limit: number) =>
    ['platform', 'tenants', page, limit] as const,
  detail: (id: string) => ['platform', 'tenants', id] as const,
  impersonations: (id: string) =>
    ['platform', 'tenants', id, 'impersonations'] as const,
  metrics: ['platform', 'metrics'] as const,
};

interface TenantListResponse {
  data: TenantListItem[];
  meta: PaginationMeta;
}

export function usePlatformTenants(page: number, limit: number) {
  return useQuery({
    queryKey: PLATFORM_TENANT_QUERY_KEYS.list(page, limit),
    queryFn: () =>
      apiFetch<TenantListResponse>(
        `/platform/tenants?page=${page}&limit=${limit}`,
      ),
  });
}

export function usePlatformTenant(id: string) {
  return useQuery({
    queryKey: PLATFORM_TENANT_QUERY_KEYS.detail(id),
    queryFn: () => apiFetch<TenantDetailResponse>(`/platform/tenants/${id}`),
  });
}

export function useTenantImpersonations(id: string) {
  return useQuery({
    queryKey: PLATFORM_TENANT_QUERY_KEYS.impersonations(id),
    queryFn: () =>
      apiFetch<ImpersonationSessionResponse[]>(
        `/platform/tenants/${id}/impersonations`,
      ),
  });
}

export function useCreateTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTenant) =>
      apiFetch<TenantResponse>('/platform/tenants', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      // Every list page and the dashboard counts are now stale.
      void queryClient.invalidateQueries({ queryKey: ['platform'] });
    },
  });
}

export function useUpdateTenant(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateTenant) =>
      apiFetch<TenantResponse>(`/platform/tenants/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['platform'] });
    },
  });
}

/** Resets a tenant OWNER's password (TASK-130). Nothing on screen changes, so no invalidation. */
export function useResetTenantOwnerPassword(id: string) {
  return useMutation({
    mutationFn: (data: ResetTenantOwnerPassword) =>
      apiFetch<{ message: string }>(
        `/platform/tenants/${id}/reset-owner-password`,
        { method: 'POST', body: JSON.stringify(data) },
      ),
  });
}

/** Corrects a tenant OWNER's email (TASK-131); invalidates tenant queries. */
export function useUpdateTenantOwnerEmail(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateTenantOwnerEmail) =>
      apiFetch<UpdateTenantOwnerEmailResponse>(
        `/platform/tenants/${id}/owner-email`,
        { method: 'PATCH', body: JSON.stringify(data) },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['platform'] });
    },
  });
}

/** Starts impersonation and hands the token to the route handler (HttpOnly cookie), then redirects. */
export function useStartImpersonation(id: string) {
  return useMutation({
    mutationFn: async (data: StartImpersonation) => {
      const session = await apiFetch<ImpersonationSessionResponse>(
        `/platform/tenants/${id}/impersonate`,
        { method: 'POST', body: JSON.stringify(data) },
      );
      const res = await fetch('/api/platform/impersonation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accessToken: session.accessToken,
          tenantName: session.actingAsEmail,
        }),
      });
      if (!res.ok) {
        throw new Error(
          'Token impersonasi tidak bisa dipasang di browser ini. Coba lagi.',
        );
      }
      return session;
    },
  });
}
