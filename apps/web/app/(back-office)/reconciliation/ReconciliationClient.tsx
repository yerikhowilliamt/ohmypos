'use client';

import * as React from 'react';
import type {
  BankTransactionResponse,
  ReconciliationSortBy,
  TransactionStatus,
} from '@ohmypos/api-contracts';
import type { OnChangeFn, SortingState } from '@tanstack/react-table';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@ohmypos/ui/components/alert';
import { Label } from '@ohmypos/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ohmypos/ui/components/select';
import { ApiError } from '@/lib/api';
import { TRANSACTION_STATUS_LABELS } from '@/lib/vocabulary';
import { useAccounts } from '@/hooks/useExpenses';
import {
  useReconciliationSummary,
  useReconciliationTransactions,
  type ReconciliationFilters,
} from '@/hooks/useReconciliation';
import { BankStatementImportCard } from '@/components/reconciliation/BankStatementImportCard';
import { BankTransactionsTable } from '@/components/reconciliation/BankTransactionsTable';
import { MatchReviewQueue } from '@/components/reconciliation/MatchReviewQueue';
import { ReconciliationSummaryCards } from '@/components/reconciliation/ReconciliationSummaryCards';
import { SplitAllocationDialog } from '@/components/reconciliation/SplitAllocationDialog';

const DEFAULT_PAGE_SIZE = 10;

/** Sentinel Select values for "all" — Radix Select rejects an empty string value. */
const ALL_ACCOUNTS_VALUE = '__all_accounts__';
const ALL_STATUS_VALUE = '__all_status__';

const STATUS_OPTIONS: TransactionStatus[] = [
  'UNRESOLVED',
  'PENDING_REVIEW',
  'PARTIALLY_ALLOCATED',
  'MATCHED',
];

/** Column ids that exist as backend sort keys (`ReconciliationSortBySchema`).
 * A sort header whose id is not here would silently fall back to txnDate. */
const SORTABLE_COLUMN_IDS: ReconciliationSortBy[] = [
  'txnDate',
  'amount',
  'description',
  'createdAt',
];

function toReconciliationSortBy(
  columnId: string | undefined,
): ReconciliationSortBy {
  return SORTABLE_COLUMN_IDS.includes(columnId as ReconciliationSortBy)
    ? (columnId as ReconciliationSortBy)
    : 'txnDate';
}

/**
 * A 403 can only reach this screen if the session's role changed after render —
 * `requireRole(['ADMIN','OWNER'])` already redirects KASIR server-side
 * (page.tsx, lib/session.ts:44) and RoleGuard is the real authority (ADR-011).
 * The screen therefore reports the refusal; it never second-guesses it.
 */
function isForbidden(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403;
}

export function ReconciliationClient() {
  const [accountId, setAccountId] = React.useState('');
  const [status, setStatus] = React.useState<TransactionStatus | ''>('');
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(DEFAULT_PAGE_SIZE);
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'txnDate', desc: true },
  ]);
  const [selected, setSelected] =
    React.useState<BankTransactionResponse | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  // A sort change invalidates the page number — page 3 of the old ordering is
  // not page 3 of the new one.
  const handleSortingChange: OnChangeFn<SortingState> = (updater) => {
    setSorting((current) =>
      typeof updater === 'function' ? updater(current) : updater,
    );
    setPage(1);
  };

  const filters: ReconciliationFilters = React.useMemo(() => {
    const activeSort = sorting[0];
    return {
      accountId: accountId || undefined,
      status: status || undefined,
      page,
      limit,
      sortBy: toReconciliationSortBy(activeSort?.id),
      sortOrder:
        activeSort?.desc === false ? ('asc' as const) : ('desc' as const),
    };
  }, [accountId, status, page, limit, sorting]);

  const accountsQuery = useAccounts();
  const summaryQuery = useReconciliationSummary(filters);
  const transactionsQuery = useReconciliationTransactions(filters);

  const forbidden = [
    accountsQuery.error,
    summaryQuery.error,
    transactionsQuery.error,
  ].some(isForbidden);

  if (forbidden) {
    return (
      <Alert variant="destructive" data-testid="reconciliation-forbidden">
        <AlertTitle>Akses ditolak</AlertTitle>
        <AlertDescription>
          Halaman ini khusus untuk Owner dan Admin untuk mencocokkan mutasi
          bank.
        </AlertDescription>
      </Alert>
    );
  }

  const meta = transactionsQuery.data?.meta;

  const handleAllocate = (transaction: BankTransactionResponse) => {
    setSelected(transaction);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Rekonsiliasi Bank
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Cocokkan mutasi rekening bank dengan pencatatan
          kas/penjualan/pengeluaran toko agar pembukuan akurat.
        </p>
      </div>

      <ReconciliationSummaryCards
        summary={summaryQuery.data}
        isLoading={summaryQuery.isLoading}
      />

      <BankStatementImportCard accounts={accountsQuery.data ?? []} />

      <MatchReviewQueue accountId={accountId || undefined} />

      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:max-w-xl">
          <div className="space-y-1.5">
            <Label htmlFor="filter-account">Akun</Label>
            <Select
              value={accountId || undefined}
              onValueChange={(value) => {
                setAccountId(value === ALL_ACCOUNTS_VALUE ? '' : value);
                setPage(1);
              }}
            >
              <SelectTrigger id="filter-account">
                <SelectValue placeholder="Semua Akun" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_ACCOUNTS_VALUE}>Semua Akun</SelectItem>
                {(accountsQuery.data ?? []).map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="filter-status">Status</Label>
            <Select
              value={status || undefined}
              onValueChange={(value) => {
                setStatus(
                  value === ALL_STATUS_VALUE
                    ? ''
                    : (value as TransactionStatus),
                );
                setPage(1);
              }}
            >
              <SelectTrigger id="filter-status">
                <SelectValue placeholder="Semua Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_STATUS_VALUE}>Semua Status</SelectItem>
                {STATUS_OPTIONS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {TRANSACTION_STATUS_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <BankTransactionsTable
          transactions={transactionsQuery.data?.data ?? []}
          isLoading={transactionsQuery.isLoading}
          onAllocate={handleAllocate}
          sorting={sorting}
          onSortingChange={handleSortingChange}
          pagination={{
            meta: meta ?? {
              total: 0,
              page,
              limit,
              totalPages: 1,
            },
            onPageChange: setPage,
            onLimitChange: (next) => {
              setLimit(next);
              setPage(1);
            },
            itemNoun: 'transaksi',
          }}
        />
      </div>

      <SplitAllocationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        transaction={selected}
      />
    </div>
  );
}
