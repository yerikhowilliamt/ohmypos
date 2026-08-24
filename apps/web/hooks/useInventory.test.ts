import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import * as apiModule from '@/lib/api';
import {
  useOpeningStockWorksheet,
  useUpsertOpeningStock,
} from './useInventory';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
  API_BASE_URL: 'http://localhost:4015/api/v1',
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
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

describe('useInventory hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches opening stock worksheet for given period', async () => {
    const mockWorksheet = {
      period: {
        month: '2026-08',
        startDate: '2026-08-01T00:00:00.000Z',
        endDate: '2026-09-01T00:00:00.000Z',
      },
      data: [
        {
          rawMaterialId: 'rm-1',
          name: 'Kopi Arabika',
          unit: 'kg',
          carryForwardQuantity: '10.0000',
          declaredQuantity: '12.0000',
          declaredUnitPrice: null,
          requiresUnitPrice: false,
          currentUnitCost: '150000',
        },
      ],
    };

    vi.mocked(apiModule.apiFetch).mockResolvedValueOnce(mockWorksheet);

    const wrapper = createWrapper();
    const { result } = renderHook(() => useOpeningStockWorksheet('2026-08'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockWorksheet);
    expect(apiModule.apiFetch).toHaveBeenCalledWith(
      '/inventory/opening-stock?period=2026-08',
    );
  });

  it('upserts opening stock, calls PUT, and invalidates both worksheet and summary queries', async () => {
    const payload = {
      periodMonth: '2026-08',
      entries: [
        {
          rawMaterialId: 'rm-1',
          quantity: '15.0000',
          unitPrice: '150000',
        },
      ],
    };

    const mockResponse = {
      period: {
        month: '2026-08',
        startDate: '2026-08-01T00:00:00.000Z',
        endDate: '2026-09-01T00:00:00.000Z',
      },
      data: [
        {
          id: 'os-1',
          rawMaterialId: 'rm-1',
          rawMaterialName: 'Kopi Arabika',
          periodMonth: '2026-08-01',
          quantity: '15.0000',
          unitPrice: '150000.00',
          appliedDelta: '5.0000',
          createdAt: '2026-08-17T00:00:00.000Z',
          updatedAt: '2026-08-17T00:00:00.000Z',
        },
      ],
    };

    vi.mocked(apiModule.apiFetch).mockResolvedValueOnce(mockResponse);

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
        mutations: { retry: false },
      },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    function Wrapper({ children }: { children: React.ReactNode }) {
      return React.createElement(
        QueryClientProvider,
        { client: queryClient },
        children,
      );
    }

    const { result } = renderHook(() => useUpsertOpeningStock(), {
      wrapper: Wrapper,
    });

    result.current.mutate(payload);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiModule.apiFetch).toHaveBeenCalledWith(
      '/inventory/opening-stock',
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
    );
    expect(result.current.data).toEqual(mockResponse);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['inventory', 'opening-stock', 'worksheet', '2026-08'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['inventory', 'summary', '2026-08'],
    });
  });
});
