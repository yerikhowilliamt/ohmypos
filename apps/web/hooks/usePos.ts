'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateSale,
  PaymentMethodResponse,
  SaleResponse,
} from '@ohmypos/api-contracts';
import { apiFetch } from '@/lib/api';
import { MASTER_DATA_QUERY_KEYS } from '@/hooks/useMasterData';

export const POS_QUERY_KEYS = {
  paymentMethods: ['accounts', 'payment-methods'] as const,
  recentSales: ['sales', 'recent'] as const,
  salesList: (params?: Record<string, unknown>) =>
    ['sales', 'list', params] as const,
};

/**
 * The only `/accounts` route a KASIR may call. Payment methods are `Account`
 * records (System Design §6.1) and change about as often as master data, so the
 * default `staleTime` is generous enough.
 */
export function usePaymentMethods() {
  return useQuery({
    queryKey: POS_QUERY_KEYS.paymentMethods,
    queryFn: () =>
      apiFetch<PaymentMethodResponse[]>('/accounts/payment-methods'),
  });
}

/**
 * A sale moves stock and money, so on success both caches are stale: raw material
 * balances fell, and every product's `makeableQuantity` moved with them (ADR-013).
 *
 * No `onError` handling here — the screen maps failures to in-cart state via
 * `mapSubmitError`, and a mutation that swallowed its own error would take that
 * away. Mutations do not retry (TanStack's default), which matters: `POST /sales`
 * has no idempotency key, so an automatic retry could double-write money.
 */
export function useCreateSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateSale) =>
      apiFetch<SaleResponse>('/sales', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: MASTER_DATA_QUERY_KEYS.rawMaterials,
      });
      queryClient.invalidateQueries({
        queryKey: MASTER_DATA_QUERY_KEYS.products,
      });
    },
  });
}

export interface PaginatedSales {
  data: SaleResponse[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

/**
 * Backs the "Periksa transaksi terakhir" affordance after an uncertain submit
 * (plan §5). `enabled: false` — it is fetched on demand, never on mount.
 *
 * No `branchId` is sent: `BranchScopeGuard` injects the KASIR's own branch, and
 * sending it explicitly would only create a way to get it wrong.
 */
export function useRecentSales() {
  return useQuery({
    queryKey: POS_QUERY_KEYS.recentSales,
    queryFn: () =>
      apiFetch<PaginatedSales>('/sales?limit=5&sortBy=soldAt&page=1'),
    enabled: false,
    gcTime: 0,
  });
}

export interface SalesFilterParams {
  branchId?: string;
  accountId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
  sortBy?: 'soldAt' | 'totalAmount' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export function useSales(params: SalesFilterParams = {}) {
  const searchParams = new URLSearchParams();
  if (params.branchId) searchParams.set('branchId', params.branchId);
  if (params.accountId) searchParams.set('accountId', params.accountId);
  if (params.startDate) searchParams.set('startDate', params.startDate);
  if (params.endDate) searchParams.set('endDate', params.endDate);
  if (params.sortBy) searchParams.set('sortBy', params.sortBy);
  if (params.sortOrder) searchParams.set('sortOrder', params.sortOrder);
  if (params.page) searchParams.set('page', String(params.page));
  if (params.limit) searchParams.set('limit', String(params.limit));

  const qs = searchParams.toString();
  const path = qs ? `/sales?${qs}` : '/sales';

  return useQuery({
    queryKey: POS_QUERY_KEYS.salesList(params as Record<string, unknown>),
    queryFn: () => apiFetch<PaginatedSales>(path),
  });
}
