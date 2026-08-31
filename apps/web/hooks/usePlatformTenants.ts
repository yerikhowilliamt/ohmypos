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

/**
 * TASK-130 — the operator's last-resort recovery for a tenant whose OWNER is
 * locked out. Nothing on screen changes as a result (a password appears in no
 * response), so nothing is invalidated; the server's message is the result.
 */
export function useResetTenantOwnerPassword(id: string) {
  return useMutation({
    mutationFn: (data: ResetTenantOwnerPassword) =>
      apiFetch<{ message: string }>(
        `/platform/tenants/${id}/reset-owner-password`,
        { method: 'POST', body: JSON.stringify(data) },
      ),
  });
}

/**
 * TASK-131 — correcting the address a tenant OWNER logs in with, for the case
 * where it was mistyped at provisioning and nobody inside the tenant can get in
 * to fix it.
 *
 * Unlike the password reset, this one DOES change what is on screen — the
 * detail header shows `ownerEmail`, and `isPristine` is read by the dialog — so
 * the platform queries are invalidated.
 */
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

/**
 * ADR-025 Decision 8 — starts a read-only session and hands the token to the
 * app's own route handler, which is what turns it into the `access_token`
 * cookie the tenant app reads. The console never holds the token in JS state
 * beyond this call: it goes straight into an HttpOnly cookie and the browser
 * is redirected.
 */
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
