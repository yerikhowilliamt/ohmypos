'use client';

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
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

/** Payment methods: the only `/accounts` route a KASIR may call. */
export function usePaymentMethods() {
  return useQuery({
    queryKey: POS_QUERY_KEYS.paymentMethods,
    queryFn: () =>
      apiFetch<PaymentMethodResponse[]>('/accounts/payment-methods'),
  });
}

/**
 * Creates a sale and invalidates stock and product caches. Errors are mapped by
 * `mapSubmitError`; no automatic retry (the caller owns the idempotency key).
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

/** Last sales for "Periksa transaksi terakhir"; fetched on demand only. Sends no branchId (see DEBT-080). */
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
  /** Free-text search, matched server-side against id, branch, cashier and account. */
  search?: string;
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
  // Falsy guard so an empty search does not change the query key.
  if (params.search) searchParams.set('search', params.search);
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
    // Keep the previous page visible while the next one loads.
    placeholderData: keepPreviousData,
  });
}

export function useVoidSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<SaleResponse>(`/sales/${id}/void`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['sales'],
      });
      queryClient.invalidateQueries({
        queryKey: MASTER_DATA_QUERY_KEYS.rawMaterials,
      });
      queryClient.invalidateQueries({
        queryKey: MASTER_DATA_QUERY_KEYS.products,
      });
    },
  });
}
