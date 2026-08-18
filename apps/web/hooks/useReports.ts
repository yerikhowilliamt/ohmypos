'use client';

import { useQuery } from '@tanstack/react-query';
import type {
  CashBalanceResponse,
  DailyIncomeResponse,
  IncomeByPaymentMethodResponse,
  ProductProfitResponse,
  ProductRankBy,
  ProfitLossResponse,
  TopProductsResponse,
} from '@ohmypos/api-contracts';
import { apiFetch } from '@/lib/api';

/**
 * Dashboard 3 (PRD §5.4) — OWNER-only, server-aggregated reports
 * (`apps/api/src/modules/reports`, ADR-008/ADR-017/ADR-018). Every hook here
 * mirrors the shared filter shape; nothing is recomputed client-side.
 */
export interface ReportFilters {
  startDate: string;
  endDate: string;
  branchId?: string;
}

export interface TopProductsFilters extends ReportFilters {
  rankBy?: ProductRankBy;
  limit?: number;
}

export const REPORTS_QUERY_KEYS = {
  profitLoss: (f: ReportFilters) => ['reports', 'profit-loss', f] as const,
  productProfit: (f: ReportFilters) =>
    ['reports', 'product-profit', f] as const,
  incomeByPaymentMethod: (f: ReportFilters) =>
    ['reports', 'income-by-payment-method', f] as const,
  topProducts: (f: TopProductsFilters) =>
    ['reports', 'top-products', f] as const,
  dailyIncome: (f: ReportFilters) => ['reports', 'daily-income', f] as const,
  cashBalance: (asOfDate?: string) =>
    ['reports', 'cash-balance', asOfDate ?? 'today'] as const,
};

function buildQueryString(filters: ReportFilters): string {
  const params = new URLSearchParams({
    startDate: filters.startDate,
    endDate: filters.endDate,
  });
  if (filters.branchId) {
    params.set('branchId', filters.branchId);
  }
  return params.toString();
}

/** A range is only ready once both ends are set — enabled gates every hook below. */
function isRangeReady(filters: ReportFilters): boolean {
  return Boolean(filters.startDate && filters.endDate);
}

export function useProfitLoss(filters: ReportFilters, enabled = true) {
  return useQuery({
    queryKey: REPORTS_QUERY_KEYS.profitLoss(filters),
    queryFn: () =>
      apiFetch<ProfitLossResponse>(
        `/reports/profit-loss?${buildQueryString(filters)}`,
      ),
    enabled: enabled && isRangeReady(filters),
  });
}

export function useProductProfit(filters: ReportFilters, enabled = true) {
  return useQuery({
    queryKey: REPORTS_QUERY_KEYS.productProfit(filters),
    queryFn: () =>
      apiFetch<ProductProfitResponse>(
        `/reports/product-profit?${buildQueryString(filters)}`,
      ),
    enabled: enabled && isRangeReady(filters),
  });
}

export function useIncomeByPaymentMethod(
  filters: ReportFilters,
  enabled = true,
) {
  return useQuery({
    queryKey: REPORTS_QUERY_KEYS.incomeByPaymentMethod(filters),
    queryFn: () =>
      apiFetch<IncomeByPaymentMethodResponse>(
        `/reports/income-by-payment-method?${buildQueryString(filters)}`,
      ),
    enabled: enabled && isRangeReady(filters),
  });
}

export function useTopProducts(filters: TopProductsFilters, enabled = true) {
  return useQuery({
    queryKey: REPORTS_QUERY_KEYS.topProducts(filters),
    queryFn: () => {
      const params = new URLSearchParams(buildQueryString(filters));
      if (filters.rankBy) params.set('rankBy', filters.rankBy);
      if (filters.limit) params.set('limit', String(filters.limit));
      return apiFetch<TopProductsResponse>(
        `/reports/top-products?${params.toString()}`,
      );
    },
    enabled: enabled && isRangeReady(filters),
  });
}

export function useDailyIncome(filters: ReportFilters, enabled = true) {
  return useQuery({
    queryKey: REPORTS_QUERY_KEYS.dailyIncome(filters),
    queryFn: () =>
      apiFetch<DailyIncomeResponse>(
        `/reports/daily-income?${buildQueryString(filters)}`,
      ),
    enabled: enabled && isRangeReady(filters),
  });
}

/** Running cash balance (§1, ADR-004/glossary Kas Awal). `asOfDate` omitted = today (WIB, server-resolved). */
export function useCashBalance(asOfDate?: string) {
  return useQuery({
    queryKey: REPORTS_QUERY_KEYS.cashBalance(asOfDate),
    queryFn: () =>
      apiFetch<CashBalanceResponse>(
        asOfDate
          ? `/reports/cash-balance?asOfDate=${encodeURIComponent(asOfDate)}`
          : '/reports/cash-balance',
      ),
  });
}
