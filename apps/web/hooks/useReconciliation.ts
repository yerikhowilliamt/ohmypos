'use client';

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { BANK_IMPORT_FORMATS } from '@ohmypos/api-contracts';
import type {
  AllocationResponse,
  AllocationWithLedgerEntry,
  BankImportFormat,
  BankTransactionResponse,
  CreateAllocation,
  ImportResult,
  LedgerEntryResponse,
  PaginationMeta,
  ProposeMatches,
  ProposeMatchesResponse,
  ReconciliationSortBy,
  ReconciliationSummary,
  SortOrder,
  TransactionStatus,
  TransactionType,
} from '@ohmypos/api-contracts';
import { apiFetch } from '@/lib/api';

// Every endpoint here is ADMIN/OWNER-only server-side; these hooks add no authorization.

export interface ReconciliationFilters {
  /** Transactions list only; never sent to the summary (it would skew `variance`). */
  search?: string;
  accountId?: string;
  status?: TransactionStatus;
  page: number;
  limit: number;
  sortBy?: ReconciliationSortBy;
  sortOrder?: SortOrder;
}

export const RECONCILIATION_QUERY_KEYS = {
  summary: (f: ReconciliationFilters) =>
    ['reconciliation', 'summary', f] as const,
  transactions: (f: ReconciliationFilters) =>
    ['reconciliation', 'transactions', f] as const,
  pendingReview: (accountId?: string) =>
    ['reconciliation', 'pending-review', accountId ?? 'all'] as const,
  allocations: (txnId: string) =>
    ['allocations', 'transaction', txnId] as const,
  ledgerCandidates: (
    type: TransactionType,
    accountId: string,
    startDate: string,
    endDate: string,
  ) =>
    [
      'ledger-entries',
      'candidates',
      type,
      accountId,
      startDate,
      endDate,
    ] as const,
};

/** `includeSort` is false for the summary, which ignores ordering. */
function buildQuery(
  filters: ReconciliationFilters,
  includeSort = true,
): string {
  const params = new URLSearchParams({
    page: String(filters.page),
    limit: String(filters.limit),
  });
  if (includeSort) {
    params.set('sortBy', filters.sortBy ?? 'txnDate');
    params.set('sortOrder', filters.sortOrder ?? 'desc');
  }
  if (filters.search) params.set('search', filters.search);
  if (filters.accountId) params.set('accountId', filters.accountId);
  if (filters.status) params.set('status', filters.status);
  return params.toString();
}

/**
 * The filters the summary varies on, listed explicitly. Excludes sort (no
 * effect) and `search` (would skew `variance`).
 */
function summaryFilters(filters: ReconciliationFilters): ReconciliationFilters {
  return {
    accountId: filters.accountId,
    status: filters.status,
    page: filters.page,
    limit: filters.limit,
  };
}

/** Runaway-loop guard for the paging loop (20 × 100 rows), not a real ceiling. */
const MAX_LOOKUP_PAGES = 20;
const LOOKUP_PAGE_SIZE = 100;

/** Fetches every page. Both callers are lookups that must be complete (TASK-068). */
async function fetchAllPages<T>(
  buildPath: (page: number) => string,
): Promise<T[]> {
  const rows: T[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const response = await apiFetch<{ data: T[]; meta: PaginationMeta }>(
      buildPath(page),
    );
    rows.push(...response.data);
    totalPages = response.meta.totalPages;
    page += 1;
  } while (page <= totalPages && page <= MAX_LOOKUP_PAGES);

  return rows;
}

// Read side

export function useReconciliationSummary(filters: ReconciliationFilters) {
  const scoped = summaryFilters(filters);
  return useQuery({
    queryKey: RECONCILIATION_QUERY_KEYS.summary(scoped),
    queryFn: () =>
      apiFetch<ReconciliationSummary>(
        `/reconciliation/summary?${buildQuery(scoped, false)}`,
      ),
  });
}

/** One page outside React Query, for Export (DEBT-048). Shares `buildQuery` with the hook. */
export function fetchReconciliationTransactionsPage(
  filters: ReconciliationFilters,
) {
  return apiFetch<{ data: BankTransactionResponse[]; meta: PaginationMeta }>(
    `/reconciliation/transactions?${buildQuery(filters)}`,
  );
}

export function useReconciliationTransactions(filters: ReconciliationFilters) {
  return useQuery({
    queryKey: RECONCILIATION_QUERY_KEYS.transactions(filters),
    queryFn: () => fetchReconciliationTransactionsPage(filters),
    placeholderData: keepPreviousData,
  });
}

/**
 * Every PENDING_REVIEW transaction, as a complete array (not a page), so the
 * match queue can resolve candidate amounts. Disabled until propose has run.
 */
export function usePendingReviewTransactions(
  accountId: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: RECONCILIATION_QUERY_KEYS.pendingReview(accountId),
    queryFn: () =>
      fetchAllPages<BankTransactionResponse>((page) => {
        const params = new URLSearchParams({
          status: 'PENDING_REVIEW',
          limit: String(LOOKUP_PAGE_SIZE),
          page: String(page),
          sortBy: 'txnDate',
          sortOrder: 'desc',
        });
        if (accountId) params.set('accountId', accountId);
        return `/reconciliation/transactions?${params.toString()}`;
      }),
    enabled,
  });
}

export function useTransactionAllocations(txnId: string | null) {
  return useQuery({
    queryKey: RECONCILIATION_QUERY_KEYS.allocations(txnId ?? ''),
    queryFn: () =>
      apiFetch<AllocationWithLedgerEntry[]>(
        `/allocations/transaction/${txnId}`,
      ),
    enabled: Boolean(txnId),
  });
}

/** Day window around the anchor transaction for the manual ledger-entry picker; wider than auto-matching (ADR-019). */
const LEDGER_CANDIDATE_WINDOW_DAYS = 30;

/** `YYYY-MM-DD` from local date parts; `toISOString()` would shift a day in WIB. */
function toDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function ledgerCandidateWindow(txnDate: string | Date): {
  startDate: string;
  endDate: string;
} {
  const anchor = new Date(txnDate);
  const start = new Date(anchor);
  start.setDate(start.getDate() - LEDGER_CANDIDATE_WINDOW_DAYS);
  const end = new Date(anchor);
  end.setDate(end.getDate() + LEDGER_CANDIDATE_WINDOW_DAYS);
  return { startDate: toDateOnly(start), endDate: toDateOnly(end) };
}

/** Ledger entries of the same type within ±30 days of the anchor, every page (ADR-019). */
export function useLedgerEntryCandidates(
  type: TransactionType | null,
  accountId: string | null,
  /** `BankTransactionResponse.txnDate` — the wire shape is `z.date().or(z.string())`. */
  txnDate: string | Date | null,
) {
  const window = txnDate ? ledgerCandidateWindow(txnDate) : null;

  return useQuery({
    queryKey: RECONCILIATION_QUERY_KEYS.ledgerCandidates(
      type ?? 'INFLOW',
      accountId ?? '',
      window?.startDate ?? '',
      window?.endDate ?? '',
    ),
    queryFn: () =>
      // Every page: the API orders by entryDate DESC, so truncation drops the oldest (often nearest) entries.
      fetchAllPages<LedgerEntryResponse>((page) => {
        const params = new URLSearchParams({
          limit: String(LOOKUP_PAGE_SIZE),
          page: String(page),
          sortBy: 'entryDate',
        });
        if (type) params.set('type', type);
        if (accountId) params.set('accountId', accountId);
        if (window) {
          params.set('startDate', window.startDate);
          params.set('endDate', window.endDate);
        }
        return `/ledger-entries?${params.toString()}`;
      }),
    enabled: Boolean(type) && Boolean(accountId) && Boolean(txnDate),
  });
}

// Write side

/** Invalidates everything a money write can change. Status is trigger-derived, so it is refetched. */
function useReconciliationInvalidation() {
  const queryClient = useQueryClient();
  return (txnIds: string[] = []) => {
    queryClient.invalidateQueries({ queryKey: ['reconciliation'] });
    for (const id of txnIds) {
      queryClient.invalidateQueries({
        queryKey: RECONCILIATION_QUERY_KEYS.allocations(id),
      });
    }
  };
}

export function useImportBankStatement() {
  const invalidate = useReconciliationInvalidation();
  return useMutation({
    mutationFn: ({
      accountId,
      format,
      file,
      password,
    }: {
      accountId: string;
      format: BankImportFormat;
      file: File;
      password?: string;
    }) => {
      // Multipart field `file`; apiFetch leaves Content-Type to the browser for FormData.
      const body = new FormData();
      body.append('file', file);
      // CSV and PDF are separate routes so each can validate its own file type.
      const container =
        BANK_IMPORT_FORMATS.find((entry) => entry.value === format)
          ?.container ?? 'csv';
      const searchParams = new URLSearchParams({ format });
      if (password && password.trim() !== '') {
        searchParams.set('password', password.trim());
      }
      return apiFetch<ImportResult>(
        `/import/${container}/${accountId}?${searchParams.toString()}`,
        { method: 'POST', body },
      );
    },
    onSuccess: () => invalidate(),
  });
}

/** A mutation, not a query: propose writes statuses and must only run on an explicit action. */
export function useProposeMatches() {
  const invalidate = useReconciliationInvalidation();
  return useMutation({
    mutationFn: (dto: ProposeMatches) =>
      apiFetch<ProposeMatchesResponse>('/matching/propose', {
        method: 'POST',
        body: JSON.stringify(dto),
      }),
    onSuccess: () => invalidate(),
  });
}

/** Resets EVERY PENDING_REVIEW transaction (optionally per account) back to UNRESOLVED. */
export function useResetMatches() {
  const invalidate = useReconciliationInvalidation();
  return useMutation({
    mutationFn: (accountId?: string) =>
      apiFetch<{ resetCount: number }>('/matching/reset', {
        method: 'POST',
        body: JSON.stringify(accountId ? { accountId } : {}),
      }),
    onSuccess: () => invalidate(),
  });
}

/** Rejects one proposed match ("Abaikan"), returning it to UNRESOLVED. */
export function useRejectMatch() {
  const invalidate = useReconciliationInvalidation();
  return useMutation({
    mutationFn: (bankTransactionId: string) =>
      apiFetch<BankTransactionResponse>(
        `/matching/reject/${bankTransactionId}`,
        { method: 'POST' },
      ),
    onSuccess: (updated) => invalidate([updated.id]),
  });
}

export function useCreateAllocations() {
  const invalidate = useReconciliationInvalidation();
  return useMutation({
    mutationFn: (payload: CreateAllocation) =>
      apiFetch<AllocationResponse[]>('/allocations', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: (created) =>
      invalidate(created.map((allocation) => allocation.bankTransactionId)),
  });
}

export function useRevokeAllocation() {
  const invalidate = useReconciliationInvalidation();
  return useMutation({
    mutationFn: (allocationId: string) =>
      apiFetch<AllocationResponse>(`/allocations/${allocationId}/revoke`, {
        method: 'POST',
      }),
    onSuccess: (revoked) => invalidate([revoked.bankTransactionId]),
  });
}
