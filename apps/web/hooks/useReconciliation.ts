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
  MatchCandidate,
  PaginationMeta,
  ProposeMatches,
  ReconciliationSortBy,
  ReconciliationSummary,
  SortOrder,
  TransactionStatus,
  TransactionType,
} from '@ohmypos/api-contracts';
import { apiFetch } from '@/lib/api';

/**
 * Reconciliation data access (PRD §5.7, System Design §6.5). Every endpoint
 * here is ADMIN/OWNER-only server-side (RoleGuard on the import, matching,
 * allocation and reconciliation controllers, ADR-011 §6) — these hooks add no
 * authorization logic of their own and must not try to.
 */

export interface ReconciliationFilters {
  /**
   * Transactions list ONLY. `summaryFilters` drops it on the way to the summary
   * endpoint: it matches bank descriptions and nothing on the ledger side, so
   * letting it through would skew `variance`.
   */
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

/**
 * `includeSort` is false for the summary endpoint: it takes the same DTO but
 * ignores ordering entirely (it only calls buildWhereClause), so sending the
 * sort would make the summary refetch on every sort-header click for an
 * identical response.
 */
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

/** The subset of the filters the summary actually varies on. Keeping the sort
 * out of its query key is what stops the pointless refetch described above.
 *
 * `search` is omitted for a harder reason than efficiency: it only matches bank
 * descriptions, so passing it would shrink the bank side of `variance` while
 * the ledger side stayed whole. Built by listing fields rather than by
 * spreading + deleting, so a new filter has to be added here on purpose. */
function summaryFilters(filters: ReconciliationFilters): ReconciliationFilters {
  return {
    accountId: filters.accountId,
    status: filters.status,
    page: filters.page,
    limit: filters.limit,
  };
}

/**
 * Upper bound on the paging loop below: 20 pages x limit 100 = 2000 rows. This
 * is a guard against a runaway loop if `meta.totalPages` were ever wrong, not a
 * real ceiling — both call sites are narrowly filtered and nowhere near it.
 */
const MAX_LOOKUP_PAGES = 20;
const LOOKUP_PAGE_SIZE = 100;

/**
 * Fetches EVERY page of a paginated endpoint, not just the first.
 *
 * Both call sites below are lookups, not display lists — truncating them does
 * not show the operator less, it makes the screen wrong (TASK-068). At v1
 * volumes this issues exactly one request, the same request as before; it only
 * costs more when correctness requires it.
 */
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

// --- Read side (reconciliation module) ---

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

/**
 * One page, outside React Query — the Export button's `fetchAllPages` loop needs
 * it (DEBT-048). Shares `buildQuery` with the hook so the exported set can never
 * drift from the one on screen.
 */
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
 * The transactions the match queue needs the amounts of. `MatchCandidate`
 * carries no per-transaction amount (matching.schema.ts:20) and propose() has
 * just flipped every matched transaction to PENDING_REVIEW
 * (matching.service.ts:70), so this is the list to resolve them against.
 *
 * `enabled` is off until the operator has actually run propose — this must not
 * fire on mount.
 */
/**
 * Returns a plain array, not `{ data, meta }`, because after TASK-068 there is
 * no page to report — the shape change is deliberate, so no caller can mistake
 * one page for the whole set.
 *
 * Completeness is not a nicety here. `MatchReviewQueue` resolves every
 * candidate's amounts through this list; a transaction missing from it produces
 * "Data transaksi bank untuk usulan ini belum termuat. Jalankan ulang
 * pencocokan otomatis." — advice that cannot work, because propose() only
 * selects UNRESOLVED (matching.service.ts:19) and these are already
 * PENDING_REVIEW. Truncating this list dead-ends the operator.
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

/**
 * How many days on either side of the anchor bank transaction's `txnDate` the
 * ledger-entry candidate picker searches (ADR-019 / `LedgerEntryQuerySchema`'s
 * `startDate`/`endDate`, `ledger-entry.schema.ts`). Deliberately wider than the
 * matching engine's `dateToleranceDays` default of 3 days
 * (`matching.service.ts:34`) — a human manually hunting for a stray entry
 * should be able to find one further out than the auto-matcher would ever
 * propose.
 */
const LEDGER_CANDIDATE_WINDOW_DAYS = 30;

/** Formats a Date as `YYYY-MM-DD` using LOCAL components, not `toISOString()`,
 * which reads UTC and would shift the boundary backward a day in any
 * positive-UTC-offset timezone — including WIB (ADR-018), this app's target. */
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

/**
 * Ledger entries offered as split targets. `type` is a hard server-side filter
 * because a direction mismatch is a guaranteed 400
 * (allocation.service.ts:123). `accountId` narrows sensibly, and
 * `startDate`/`endDate` window the search to ±30 days around the anchor
 * transaction's date server-side (ADR-019) — every page of that window is
 * fetched, and the dialog then applies a client-side nearest-date-first sort as
 * a secondary refinement.
 */
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
      // Every page, not the first 100. `/ledger-entries` orders by entryDate
      // DESC, so a truncated window drops its OLDEST entries — which is exactly
      // where the nearest-date match sits when the anchor transaction is early
      // in its own ±30-day window. The dialog's client-side nearest-date sort
      // and its text filter both operate on whatever this returns, so a short
      // list makes the operator conclude an entry does not exist.
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

// --- Write side ---

/**
 * Invalidates everything a money write can move: the transaction list, the
 * summary counts/variance, the pending-review lookup, and (when known) that
 * transaction's allocations. Status is trigger-derived
 * (sync_transaction_status), so it is refetched, never predicted client-side.
 */
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
      // Field name `file` and the multipart shape come from
      // import.controller.ts (FileInterceptor('file')); apiFetch omits the
      // JSON Content-Type for a FormData body so the browser sets the boundary.
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

/**
 * NOTE: this is a mutation, not a query, and that is deliberate — propose()
 * WRITES, flipping every matched transaction from UNRESOLVED to PENDING_REVIEW
 * (matching.service.ts:70). Behind a useQuery it would silently mutate status
 * on mount and on every window refocus. It must stay behind an explicit action.
 */
export function useProposeMatches() {
  const invalidate = useReconciliationInvalidation();
  return useMutation({
    mutationFn: (dto: ProposeMatches) =>
      apiFetch<MatchCandidate[]>('/matching/propose', {
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

/**
 * Rejects a single proposed match, returning that one bank transaction from
 * PENDING_REVIEW to UNRESOLVED (POST /matching/reject/:bankTransactionId,
 * matching.controller.ts). Unlike `useResetMatches`, this is scoped to one
 * transaction — the correct granularity for a per-candidate "Abaikan" action
 * (see MatchReviewQueue).
 */
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
