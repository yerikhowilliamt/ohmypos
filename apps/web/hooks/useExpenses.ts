'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AccountResponse,
  BranchResponse,
  CategoryResponse,
  CreateLedgerEntry,
  CreatePayableSettlement,
  CreateSupplier,
  CreateSupplierPurchase,
  LedgerEntryResponse,
  PaginationMeta,
  PayableResponse,
  PayableSettlementResponse,
  PayableSupplierSummary,
  SupplierPurchaseResponse,
  SupplierResponse,
} from '@ohmypos/api-contracts';
import { apiFetch } from '@/lib/api';

export const EXPENSES_QUERY_KEYS = {
  ledgerEntries: ['ledger-entries'] as const,
  categories: ['categories'] as const,
  accounts: ['accounts'] as const,
  branches: ['branches'] as const,
  suppliers: ['suppliers'] as const,
  supplierPurchases: ['supplier-purchases'] as const,
  payables: ['payables'] as const,
  payablesSummary: ['payables', 'summary'] as const,
};

// --- Reference data (categories / accounts / branches) ---
// None of these has a dedicated hook file yet — the only existing touch point
// is usePos.ts's narrow `/accounts/payment-methods` projection, which omits
// openingBalance and isn't reusable for a form that needs the full Account.

export function useCategories() {
  return useQuery({
    queryKey: EXPENSES_QUERY_KEYS.categories,
    queryFn: () => apiFetch<CategoryResponse[]>('/categories'),
  });
}

export function useAccounts() {
  return useQuery({
    queryKey: EXPENSES_QUERY_KEYS.accounts,
    queryFn: () => apiFetch<AccountResponse[]>('/accounts'),
  });
}

export function useBranches() {
  return useQuery({
    queryKey: EXPENSES_QUERY_KEYS.branches,
    queryFn: () => apiFetch<BranchResponse[]>('/branches'),
  });
}

// --- General Expenses (manual LedgerEntry, type=OUTFLOW, sourceType=MANUAL) ---

export function useLedgerEntries() {
  return useQuery({
    queryKey: EXPENSES_QUERY_KEYS.ledgerEntries,
    queryFn: () =>
      apiFetch<{ data: LedgerEntryResponse[]; meta: PaginationMeta }>(
        '/ledger-entries?type=OUTFLOW&sortBy=entryDate&limit=50',
      ),
  });
}

export function useCreateLedgerEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateLedgerEntry) =>
      apiFetch<LedgerEntryResponse>('/ledger-entries', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: EXPENSES_QUERY_KEYS.ledgerEntries,
      });
    },
  });
}

// --- Suppliers (read + quick-create only — full CRUD deferred, see Tech Debt Log) ---

export function useSuppliers() {
  return useQuery({
    queryKey: EXPENSES_QUERY_KEYS.suppliers,
    queryFn: () =>
      apiFetch<{ data: SupplierResponse[]; meta: PaginationMeta }>(
        '/suppliers?limit=100',
      ),
  });
}

export function useCreateSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateSupplier) =>
      apiFetch<SupplierResponse>('/suppliers', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: EXPENSES_QUERY_KEYS.suppliers,
      });
    },
  });
}

// --- Supplier Purchases ---

export function useSupplierPurchases() {
  return useQuery({
    queryKey: EXPENSES_QUERY_KEYS.supplierPurchases,
    queryFn: () =>
      apiFetch<{ data: SupplierPurchaseResponse[]; meta: PaginationMeta }>(
        '/supplier-purchases?sortBy=purchaseDate&limit=50',
      ),
  });
}

export function useCreateSupplierPurchase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateSupplierPurchase) =>
      apiFetch<SupplierPurchaseResponse>('/supplier-purchases', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: EXPENSES_QUERY_KEYS.supplierPurchases,
      });
      // An UNPAID purchase creates/increments a Payable (ADR-006).
      queryClient.invalidateQueries({ queryKey: EXPENSES_QUERY_KEYS.payables });
      queryClient.invalidateQueries({
        queryKey: EXPENSES_QUERY_KEYS.payablesSummary,
      });
    },
  });
}

// --- Payables / Settlements ---

export function usePayables() {
  return useQuery({
    queryKey: EXPENSES_QUERY_KEYS.payables,
    queryFn: () =>
      apiFetch<{ data: PayableResponse[]; meta: PaginationMeta }>(
        '/payables?sortBy=createdAt&limit=50',
      ),
  });
}

export function usePayablesSummary() {
  return useQuery({
    queryKey: EXPENSES_QUERY_KEYS.payablesSummary,
    queryFn: () => apiFetch<PayableSupplierSummary[]>('/payables/summary'),
  });
}

export function useSettlePayable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      payableId,
      data,
    }: {
      payableId: string;
      data: CreatePayableSettlement;
    }) =>
      apiFetch<PayableSettlementResponse>(
        `/payables/${payableId}/settlements`,
        {
          method: 'POST',
          body: JSON.stringify(data),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: EXPENSES_QUERY_KEYS.payables });
      queryClient.invalidateQueries({
        queryKey: EXPENSES_QUERY_KEYS.payablesSummary,
      });
    },
  });
}
