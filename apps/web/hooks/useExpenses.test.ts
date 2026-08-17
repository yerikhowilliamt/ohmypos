import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import * as apiModule from '@/lib/api';
import {
  useCategories,
  useAccounts,
  useBranches,
  useLedgerEntries,
  useCreateLedgerEntry,
  useSuppliers,
  useCreateSupplier,
  useSupplierPurchases,
  useCreateSupplierPurchase,
  usePayables,
  usePayablesSummary,
  useSettlePayable,
} from './useExpenses';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
  API_BASE_URL: 'http://localhost:4013/api/v1',
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

describe('useExpenses hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches categories, accounts, and branches', async () => {
    const mockCategories = [{ id: 'cat-1', name: 'Sewa', type: 'OUTFLOW' }];
    const mockAccounts = [{ id: 'acc-1', name: 'Kas', type: 'CASH' }];
    const mockBranches = [{ id: 'br-1', name: 'Melati' }];

    vi.mocked(apiModule.apiFetch).mockImplementation((path: string) => {
      if (path === '/categories') return Promise.resolve(mockCategories);
      if (path === '/accounts') return Promise.resolve(mockAccounts);
      if (path === '/branches') return Promise.resolve(mockBranches);
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    });

    const wrapper = createWrapper();
    const { result: catResult } = renderHook(() => useCategories(), {
      wrapper,
    });
    const { result: accResult } = renderHook(() => useAccounts(), { wrapper });
    const { result: brResult } = renderHook(() => useBranches(), { wrapper });

    await waitFor(() => expect(catResult.current.isSuccess).toBe(true));
    await waitFor(() => expect(accResult.current.isSuccess).toBe(true));
    await waitFor(() => expect(brResult.current.isSuccess).toBe(true));

    expect(catResult.current.data).toEqual(mockCategories);
    expect(accResult.current.data).toEqual(mockAccounts);
    expect(brResult.current.data).toEqual(mockBranches);
  });

  it('fetches and creates ledger entries', async () => {
    const mockEntries = {
      data: [{ id: 'le-0', amount: '250000', type: 'OUTFLOW' }],
      meta: { page: 1, limit: 50, total: 1, totalPages: 1 },
    };
    vi.mocked(apiModule.apiFetch).mockResolvedValueOnce(mockEntries);

    const wrapper = createWrapper();
    const { result: queryResult } = renderHook(() => useLedgerEntries(), {
      wrapper,
    });

    await waitFor(() => expect(queryResult.current.isSuccess).toBe(true));
    expect(queryResult.current.data).toEqual(mockEntries);

    const newEntry = {
      accountId: 'acc-1',
      categoryId: 'cat-1',
      branchId: 'br-1',
      entryDate: '2026-08-17',
      amount: '100000',
      type: 'OUTFLOW' as const,
      note: 'Test',
    };
    const mockResponse = { id: 'le-1', ...newEntry };

    vi.mocked(apiModule.apiFetch).mockResolvedValueOnce(mockResponse);

    const { result: mutationResult } = renderHook(
      () => useCreateLedgerEntry(),
      { wrapper },
    );

    mutationResult.current.mutate(newEntry);

    await waitFor(() => expect(mutationResult.current.isSuccess).toBe(true));
    expect(apiModule.apiFetch).toHaveBeenCalledWith('/ledger-entries', {
      method: 'POST',
      body: JSON.stringify(newEntry),
    });
  });

  it('fetches and creates suppliers', async () => {
    const mockSuppliers = {
      data: [{ id: 'sup-1', name: 'Supplier A', contact: null }],
      meta: { total: 1, page: 1, limit: 100, totalPages: 1 },
    };
    vi.mocked(apiModule.apiFetch).mockResolvedValueOnce(mockSuppliers);

    const wrapper = createWrapper();
    const { result: queryResult } = renderHook(() => useSuppliers(), {
      wrapper,
    });

    await waitFor(() => expect(queryResult.current.isSuccess).toBe(true));
    expect(queryResult.current.data).toEqual(mockSuppliers);

    const newSupplier = { name: 'Supplier B', contact: '08123' };
    const createdSupplier = { id: 'sup-2', ...newSupplier };
    vi.mocked(apiModule.apiFetch).mockResolvedValueOnce(createdSupplier);

    const { result: mutationResult } = renderHook(() => useCreateSupplier(), {
      wrapper,
    });
    mutationResult.current.mutate(newSupplier);

    await waitFor(() => expect(mutationResult.current.isSuccess).toBe(true));
    expect(apiModule.apiFetch).toHaveBeenCalledWith('/suppliers', {
      method: 'POST',
      body: JSON.stringify(newSupplier),
    });
  });

  it('fetches and creates supplier purchases', async () => {
    const mockPurchases = {
      data: [{ id: 'sp-1', supplierName: 'Supplier A', totalAmount: '500000' }],
      meta: { page: 1, limit: 50, total: 1, totalPages: 1 },
    };
    vi.mocked(apiModule.apiFetch).mockResolvedValueOnce(mockPurchases);

    const wrapper = createWrapper();
    const { result: queryResult } = renderHook(() => useSupplierPurchases(), {
      wrapper,
    });

    await waitFor(() => expect(queryResult.current.isSuccess).toBe(true));
    expect(queryResult.current.data).toEqual(mockPurchases);

    const newPurchase = {
      supplierId: 'sup-1',
      branchId: null,
      purchaseDate: '2026-08-17',
      paymentStatus: 'UNPAID' as const,
      note: 'Beli kopi',
      items: [
        {
          rawMaterialId: 'rm-1',
          quantity: '5',
          unitCost: '100000',
        },
      ],
    };
    vi.mocked(apiModule.apiFetch).mockResolvedValueOnce({
      id: 'sp-2',
      ...newPurchase,
    });

    const { result: mutationResult } = renderHook(
      () => useCreateSupplierPurchase(),
      { wrapper },
    );
    mutationResult.current.mutate(newPurchase);

    await waitFor(() => expect(mutationResult.current.isSuccess).toBe(true));
    expect(apiModule.apiFetch).toHaveBeenCalledWith('/supplier-purchases', {
      method: 'POST',
      body: JSON.stringify(newPurchase),
    });
  });

  it('fetches payables, summary, and settles a payable', async () => {
    const mockPayables = {
      data: [
        { id: 'pay-1', supplierName: 'Supplier A', remainingBalance: '300000' },
      ],
      meta: { page: 1, limit: 50, total: 1, totalPages: 1 },
    };
    const mockSummary = [
      {
        supplierId: 'sup-1',
        supplierName: 'Supplier A',
        openPayableCount: 1,
        totalOutstanding: '300000',
      },
    ];

    vi.mocked(apiModule.apiFetch).mockImplementation((path: string) => {
      if (path.startsWith('/payables/summary'))
        return Promise.resolve(mockSummary);
      if (path.startsWith('/payables')) return Promise.resolve(mockPayables);
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    });

    const wrapper = createWrapper();
    const { result: payResult } = renderHook(() => usePayables(), { wrapper });
    const { result: sumResult } = renderHook(() => usePayablesSummary(), {
      wrapper,
    });

    await waitFor(() => expect(payResult.current.isSuccess).toBe(true));
    await waitFor(() => expect(sumResult.current.isSuccess).toBe(true));
    expect(payResult.current.data).toEqual(mockPayables);
    expect(sumResult.current.data).toEqual(mockSummary);

    // Settle mutation
    const settlementData = {
      accountId: 'acc-1',
      amount: '300000',
      settledAt: '2026-08-17',
      note: 'Pelunasan',
    };
    vi.mocked(apiModule.apiFetch).mockResolvedValueOnce({
      id: 'settle-1',
      payableId: 'pay-1',
      amount: '300000',
    });

    const { result: settleResult } = renderHook(() => useSettlePayable(), {
      wrapper,
    });
    settleResult.current.mutate({
      payableId: 'pay-1',
      data: settlementData,
    });

    await waitFor(() => expect(settleResult.current.isSuccess).toBe(true));
    expect(apiModule.apiFetch).toHaveBeenCalledWith(
      '/payables/pay-1/settlements',
      {
        method: 'POST',
        body: JSON.stringify(settlementData),
      },
    );
  });
});
