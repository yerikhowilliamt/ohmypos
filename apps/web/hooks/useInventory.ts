'use client';

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  InventorySummaryResponse,
  OpeningStockWorksheetResponse,
  SortOrder,
  StockDirection,
  StockMovementListResponse,
  StockMovementSortBy,
  StockReferenceType,
  UpsertOpeningStock,
  UpsertOpeningStockResponse,
} from '@ohmypos/api-contracts';
import { apiFetch } from '@/lib/api';

export const INVENTORY_QUERY_KEYS = {
  openingStockWorksheet: (period: string) =>
    ['inventory', 'opening-stock', 'worksheet', period] as const,
  inventorySummary: (period: string) =>
    ['inventory', 'summary', period] as const,
  stockMovements: (params?: Record<string, unknown>) =>
    ['inventory', 'stock-movements', params] as const,
};

/** Dashboard 5 (PRD §5.6) — read-only, server-aggregated. Rendered verbatim. */
export function useInventorySummary(period: string) {
  return useQuery({
    queryKey: INVENTORY_QUERY_KEYS.inventorySummary(period),
    queryFn: () =>
      apiFetch<InventorySummaryResponse>(
        `/inventory/summary?period=${encodeURIComponent(period)}`,
      ),
    enabled: Boolean(period),
  });
}

export function useOpeningStockWorksheet(period: string) {
  return useQuery({
    queryKey: INVENTORY_QUERY_KEYS.openingStockWorksheet(period),
    queryFn: () =>
      apiFetch<OpeningStockWorksheetResponse>(
        `/inventory/opening-stock?period=${encodeURIComponent(period)}`,
      ),
    enabled: Boolean(period),
  });
}

export function useUpsertOpeningStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpsertOpeningStock) =>
      apiFetch<UpsertOpeningStockResponse>('/inventory/opening-stock', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: INVENTORY_QUERY_KEYS.openingStockWorksheet(
          variables.periodMonth,
        ),
      });
      queryClient.invalidateQueries({
        queryKey: INVENTORY_QUERY_KEYS.inventorySummary(variables.periodMonth),
      });
    },
  });
}

export interface StockMovementFilterParams {
  rawMaterialId?: string;
  branchId?: string;
  direction?: StockDirection;
  referenceType?: StockReferenceType;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
  sortBy?: StockMovementSortBy;
  sortOrder?: SortOrder;
}

/**
 * The row-level movement log behind Dashboard 5's aggregate (TASK-070).
 * Server-paginated, server-sorted and server-filtered from the first line: this
 * is the highest-volume table in the system — it grows with recipe lines per
 * sale, not with sales — so an unbounded fetch was never an option here.
 */
export function useStockMovements(params: StockMovementFilterParams = {}) {
  const searchParams = new URLSearchParams();
  if (params.rawMaterialId)
    searchParams.set('rawMaterialId', params.rawMaterialId);
  if (params.branchId) searchParams.set('branchId', params.branchId);
  if (params.direction) searchParams.set('direction', params.direction);
  if (params.referenceType)
    searchParams.set('referenceType', params.referenceType);
  if (params.startDate) searchParams.set('startDate', params.startDate);
  if (params.endDate) searchParams.set('endDate', params.endDate);
  if (params.sortBy) searchParams.set('sortBy', params.sortBy);
  if (params.sortOrder) searchParams.set('sortOrder', params.sortOrder);
  if (params.page) searchParams.set('page', String(params.page));
  if (params.limit) searchParams.set('limit', String(params.limit));

  const qs = searchParams.toString();

  return useQuery({
    queryKey: INVENTORY_QUERY_KEYS.stockMovements(
      params as Record<string, unknown>,
    ),
    queryFn: () =>
      apiFetch<StockMovementListResponse>(
        qs ? `/stock-movements?${qs}` : '/stock-movements',
      ),
    // Paging replaces the whole result set; without this the table flashes its
    // loading skeleton on every page click.
    placeholderData: keepPreviousData,
  });
}
