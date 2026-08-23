'use client';

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  AccountResponse,
  BranchResponse,
  CategoryResponse,
  CreateLedgerEntry,
  CreatePayableSettlement,
  CreateSupplier,
  CreateSupplierPurchase,
  LedgerEntryResponse,
  LedgerEntrySortBy,
  PaginationMeta,
  PayableResponse,
  PayableSettlementResponse,
  PayableSortBy,
  PayableStatus,
  PayableSupplierSummary,
  SortOrder,
  SupplierPurchaseResponse,
  SupplierPurchaseSortBy,
  SupplierResponse,
} from '@ohmypos/api-contracts';
import { apiFetch } from '@/lib/api';

/**
 * Matches `PayablesTab`'s own `DEFAULT_PAGE_SIZE`, so the three tabs of the
 * Pengeluaran screen do not each stop at a different row count.
 */
export const DEFAULT_EXPENSES_PAGE_SIZE = 10;

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

export interface LedgerEntryFilterParams {
  page?: number;
  limit?: number;
  sortBy?: LedgerEntrySortBy;
  sortOrder?: SortOrder;
}

/**
 * `type=OUTFLOW` is not a parameter: it is what the Pengeluaran Umum screen
 * *is*, not something the operator chose. Everything the operator can change
 * goes through the params object so the on-screen query and the Export loop
 * cannot diverge (see `buildPayableQuery` for the same reasoning).
 */
function buildLedgerEntryQuery(params: LedgerEntryFilterParams): string {
  const searchParams = new URLSearchParams();
  searchParams.set('type', 'OUTFLOW');
  searchParams.set('sortBy', params.sortBy ?? 'entryDate');
  searchParams.set('sortOrder', params.sortOrder ?? 'desc');
  searchParams.set('page', String(params.page ?? 1));
  searchParams.set('limit', String(params.limit ?? DEFAULT_EXPENSES_PAGE_SIZE));
  return searchParams.toString();
}

/** One page, outside React Query — `fetchAllPages` needs it (DEBT-048). */
export function fetchLedgerEntriesPage(params: LedgerEntryFilterParams = {}) {
  return apiFetch<{ data: LedgerEntryResponse[]; meta: PaginationMeta }>(
    `/ledger-entries?${buildLedgerEntryQuery(params)}`,
  );
}

export function useLedgerEntries(params: LedgerEntryFilterParams = {}) {
  return useQuery({
    queryKey: [...EXPENSES_QUERY_KEYS.ledgerEntries, params] as const,
    queryFn: () => fetchLedgerEntriesPage(params),
    placeholderData: keepPreviousData,
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

export interface SupplierPurchaseFilterParams {
  page?: number;
  limit?: number;
  sortBy?: SupplierPurchaseSortBy;
  sortOrder?: SortOrder;
}

/** See `buildLedgerEntryQuery` — same reasoning, same shared-object rule. */
function buildSupplierPurchaseQuery(
  params: SupplierPurchaseFilterParams,
): string {
  const searchParams = new URLSearchParams();
  searchParams.set('sortBy', params.sortBy ?? 'purchaseDate');
  searchParams.set('sortOrder', params.sortOrder ?? 'desc');
  searchParams.set('page', String(params.page ?? 1));
  searchParams.set('limit', String(params.limit ?? DEFAULT_EXPENSES_PAGE_SIZE));
  return searchParams.toString();
}

/** One page, outside React Query — `fetchAllPages` needs it (DEBT-048). */
export function fetchSupplierPurchasesPage(
  params: SupplierPurchaseFilterParams = {},
) {
  return apiFetch<{ data: SupplierPurchaseResponse[]; meta: PaginationMeta }>(
    `/supplier-purchases?${buildSupplierPurchaseQuery(params)}`,
  );
}

export function useSupplierPurchases(
  params: SupplierPurchaseFilterParams = {},
) {
  return useQuery({
    queryKey: [...EXPENSES_QUERY_KEYS.supplierPurchases, params] as const,
    queryFn: () => fetchSupplierPurchasesPage(params),
    placeholderData: keepPreviousData,
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

export interface PayableFilterParams {
  supplierId?: string;
  status?: PayableStatus;
  page?: number;
  limit?: number;
  sortBy?: PayableSortBy;
  sortOrder?: SortOrder;
}

/**
 * The query key keeps `['payables']` as its prefix so the settlement mutation's
 * `invalidateQueries({ queryKey: EXPENSES_QUERY_KEYS.payables })` still matches
 * every filtered/paged variant — TanStack invalidates by key prefix.
 */
function buildPayableQuery(params: PayableFilterParams): string {
  const searchParams = new URLSearchParams();
  if (params.supplierId) searchParams.set('supplierId', params.supplierId);
  if (params.status) searchParams.set('status', params.status);
  if (params.sortBy) searchParams.set('sortBy', params.sortBy);
  if (params.sortOrder) searchParams.set('sortOrder', params.sortOrder);
  searchParams.set('page', String(params.page ?? 1));
  searchParams.set('limit', String(params.limit ?? 10));
  return searchParams.toString();
}

/**
 * One page, outside React Query — the Export button's `fetchAllPages` loop needs
 * it (DEBT-048). It shares `buildPayableQuery` with the hook so the exported set
 * can never drift from the one on screen.
 */
export function fetchPayablesPage(params: PayableFilterParams) {
  return apiFetch<{ data: PayableResponse[]; meta: PaginationMeta }>(
    `/payables?${buildPayableQuery(params)}`,
  );
}

export function usePayables(params: PayableFilterParams = {}) {
  return useQuery({
    queryKey: [...EXPENSES_QUERY_KEYS.payables, params] as const,
    queryFn: () => fetchPayablesPage(params),
    placeholderData: keepPreviousData,
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
