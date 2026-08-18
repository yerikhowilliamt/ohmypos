import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import * as apiModule from '@/lib/api';
import {
  useProfitLoss,
  useProductProfit,
  useIncomeByPaymentMethod,
  useTopProducts,
  useDailyIncome,
} from './useReports';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
  API_BASE_URL: 'http://localhost:4013/api/v1',
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  };
}

const range = { startDate: '2026-08-01', endDate: '2026-08-18' };
const branchId = '11111111-1111-4111-8111-111111111111';

describe('useReports hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiModule.apiFetch).mockResolvedValue({});
  });

  it('useProfitLoss omits branchId from the query string when unset', async () => {
    const { result } = renderHook(() => useProfitLoss(range), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiModule.apiFetch).toHaveBeenCalledWith(
      '/reports/profit-loss?startDate=2026-08-01&endDate=2026-08-18',
    );
  });

  it('useProfitLoss includes branchId when set', async () => {
    const { result } = renderHook(() => useProfitLoss({ ...range, branchId }), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiModule.apiFetch).toHaveBeenCalledWith(
      `/reports/profit-loss?startDate=2026-08-01&endDate=2026-08-18&branchId=${branchId}`,
    );
  });

  it('useProductProfit calls the product-profit endpoint', async () => {
    const { result } = renderHook(() => useProductProfit(range), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiModule.apiFetch).toHaveBeenCalledWith(
      '/reports/product-profit?startDate=2026-08-01&endDate=2026-08-18',
    );
  });

  it('useIncomeByPaymentMethod calls the income-by-payment-method endpoint', async () => {
    const { result } = renderHook(() => useIncomeByPaymentMethod(range), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiModule.apiFetch).toHaveBeenCalledWith(
      '/reports/income-by-payment-method?startDate=2026-08-01&endDate=2026-08-18',
    );
  });

  it('useDailyIncome calls the daily-income endpoint', async () => {
    const { result } = renderHook(() => useDailyIncome(range), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiModule.apiFetch).toHaveBeenCalledWith(
      '/reports/daily-income?startDate=2026-08-01&endDate=2026-08-18',
    );
  });

  it('useTopProducts defaults omit rankBy/limit from the query string', async () => {
    const { result } = renderHook(() => useTopProducts(range), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiModule.apiFetch).toHaveBeenCalledWith(
      '/reports/top-products?startDate=2026-08-01&endDate=2026-08-18',
    );
  });

  it('useTopProducts includes rankBy and limit when provided', async () => {
    const { result } = renderHook(
      () => useTopProducts({ ...range, rankBy: 'profit', limit: 5 }),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiModule.apiFetch).toHaveBeenCalledWith(
      '/reports/top-products?startDate=2026-08-01&endDate=2026-08-18&rankBy=profit&limit=5',
    );
  });

  it('does not fetch when the date range is incomplete', () => {
    const { result } = renderHook(
      () => useDailyIncome({ startDate: '', endDate: '' }),
      { wrapper: createWrapper() },
    );
    expect(result.current.fetchStatus).toBe('idle');
    expect(apiModule.apiFetch).not.toHaveBeenCalled();
  });
});
