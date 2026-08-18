'use client';

import * as React from 'react';
import type {
  BankTransactionResponse,
  TransactionStatus,
} from '@ohmypos/api-contracts';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@ohmypos/ui/components/alert';
import { Button } from '@ohmypos/ui/components/button';
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

const PAGE_SIZE = 50;

/** Sentinel Select values for "all" — Radix Select rejects an empty string value. */
const ALL_ACCOUNTS_VALUE = '__all_accounts__';
const ALL_STATUS_VALUE = '__all_status__';

const STATUS_OPTIONS: TransactionStatus[] = [
  'UNRESOLVED',
  'PENDING_REVIEW',
  'PARTIALLY_ALLOCATED',
  'MATCHED',
];

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
  const [selected, setSelected] =
    React.useState<BankTransactionResponse | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const filters: ReconciliationFilters = React.useMemo(
    () => ({
      accountId: accountId || undefined,
      status: status || undefined,
      page,
      limit: PAGE_SIZE,
    }),
    [accountId, status, page],
  );

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
          Akun Anda tidak memiliki izin untuk membuka Rekonsiliasi. Hanya Admin
          dan Owner yang dapat melakukan pencocokan rekonsiliasi. Hubungi Owner
          bila Anda merasa ini keliru.
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
          Rekonsiliasi
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Impor rekening koran, tinjau usulan pencocokan otomatis, dan
          alokasikan transaksi bank ke catatan pembukuan.
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
        />

        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-text-secondary">
              Halaman {meta.page} dari {meta.totalPages} · {meta.total}{' '}
              transaksi
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={meta.page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Sebelumnya
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={meta.page >= meta.totalPages}
                onClick={() => setPage((current) => current + 1)}
              >
                Berikutnya
              </Button>
            </div>
          </div>
        )}
      </div>

      <SplitAllocationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        transaction={selected}
      />
    </div>
  );
}
