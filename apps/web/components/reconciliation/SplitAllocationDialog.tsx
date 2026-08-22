'use client';

import * as React from 'react';
import { AlertCircle, Plus, Trash2 } from 'lucide-react';
import type {
  BankTransactionResponse,
  LedgerEntryResponse,
} from '@ohmypos/api-contracts';
import { Alert, AlertDescription } from '@ohmypos/ui/components/alert';
import { Badge } from '@ohmypos/ui/components/badge';
import { Button } from '@ohmypos/ui/components/button';
import { CurrencyInput } from '@ohmypos/ui/components/currency-input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ohmypos/ui/components/dialog';
import { Input } from '@ohmypos/ui/components/input';
import { Label } from '@ohmypos/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ohmypos/ui/components/select';
import { formatCurrency } from '@/lib/formatters';
import {
  DRAFT_LINE_MESSAGES,
  summariseDraft,
  toCreateAllocationPayload,
  toMoneyString,
  type DraftAllocationLine,
} from '@/lib/reconciliation/allocation-draft';
import {
  useCreateAllocations,
  useLedgerEntryCandidates,
  useRevokeAllocation,
  useTransactionAllocations,
} from '@/hooks/useReconciliation';

function newLine(): DraftAllocationLine {
  return {
    id: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    ledgerEntryId: '',
    amountPortion: '',
  };
}

function entryLabel(entry: LedgerEntryResponse): string {
  const date = new Date(entry.entryDate).toLocaleDateString('id-ID');
  const note = entry.note ?? 'Tanpa catatan';
  return `${date} · ${formatCurrency(entry.amount)} · ${note}`;
}

interface SplitAllocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: BankTransactionResponse | null;
}

/**
 * Manual split allocation (PRD §5.7, DESIGN.md §12.3 Bank Reconciliation Split-Allocation).
 *
 * The running total is DECISION 1 Option A: the committed part is owned by the
 * server (GET /allocations/transaction/:id, ACTIVE rows only) and the draft part
 * is local state, combined by the pure `summariseDraft`. Submit is DISABLED
 * while `remaining` is negative — the operator is stopped before the request,
 * not corrected after a 400.
 *
 * This is a UX guard, never the enforcement. `AllocationService.create`'s
 * Decimal check and `trg_check_allocation_sum`'s FOR UPDATE check remain the
 * authority (Playbook §7); a concurrent allocation by another admin can still
 * make this dialog's base stale, and when it does the backend's message is
 * rendered verbatim in `serverError` below and the base is refetched.
 */
export function SplitAllocationDialog({
  open,
  onOpenChange,
  transaction,
}: SplitAllocationDialogProps) {
  const [lines, setLines] = React.useState<DraftAllocationLine[]>([newLine()]);
  const [entryFilter, setEntryFilter] = React.useState('');
  const [serverError, setServerError] = React.useState<string | null>(null);

  const { data: allocations = [], isLoading: allocationsLoading } =
    useTransactionAllocations(open && transaction ? transaction.id : null);
  const { data: entries } = useLedgerEntryCandidates(
    open && transaction ? transaction.type : null,
    open && transaction ? transaction.accountId : null,
    open && transaction ? transaction.txnDate : null,
  );
  const createAllocations = useCreateAllocations();
  const revokeAllocation = useRevokeAllocation();

  React.useEffect(() => {
    if (open) {
      // Resetting the draft form's local state whenever the dialog opens for
      // a (possibly new) transaction, not synchronizing with an external
      // system; there is no derivation that avoids the reset without
      // restructuring this into a keyed remount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLines([newLine()]);
      setEntryFilter('');
      setServerError(null);
    }
  }, [open, transaction]);

  /** Ledger entries already carrying an ACTIVE allocation — advisory only. */
  const allocatedEntryIds = React.useMemo(
    () =>
      new Set(
        allocations
          .filter((allocation) => allocation.status === 'ACTIVE')
          .map((allocation) => allocation.ledgerEntryId),
      ),
    [allocations],
  );

  /**
   * Nearest-date-first within the ±30-day window the hook already filtered
   * server-side (ADR-019): the likely match is the one closest to the bank
   * transaction's date. The hook fetches every page of that window, so this
   * sort and the text filter below both see the complete candidate set.
   */
  const entryOptions = React.useMemo(() => {
    const candidates = entries ?? [];
    const anchor = transaction ? new Date(transaction.txnDate).getTime() : 0;
    const needle = entryFilter.trim().toLowerCase();

    return candidates
      .filter((entry) =>
        needle.length === 0
          ? true
          : entryLabel(entry).toLowerCase().includes(needle),
      )
      .slice()
      .sort(
        (a, b) =>
          Math.abs(new Date(a.entryDate).getTime() - anchor) -
          Math.abs(new Date(b.entryDate).getTime() - anchor),
      );
  }, [entries, entryFilter, transaction]);

  const summary = React.useMemo(
    () =>
      summariseDraft({
        transactionAmount: transaction?.amount ?? '0',
        allocations,
        lines,
      }),
    [transaction, allocations, lines],
  );

  /**
   * Any edit rotates the line's idempotencyKey. Without this, resubmitting an
   * edited line under its old key would return the ORIGINAL allocation and
   * silently discard the edit (allocation.service.ts:67-100). `id` is left
   * alone so React keeps the input mounted and focused.
   */
  const updateLine = (id: string, patch: Partial<DraftAllocationLine>) => {
    setLines((previous) =>
      previous.map((line) =>
        line.id === id
          ? { ...line, ...patch, idempotencyKey: crypto.randomUUID() }
          : line,
      ),
    );
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!transaction || !summary.submittable) return;

    setServerError(null);
    try {
      await createAllocations.mutateAsync(
        toCreateAllocationPayload(transaction.id, lines, summary.lineStates),
      );
      // Partial splits are normal: the dialog stays open with fresh, empty
      // lines so the operator can keep going against the refetched remainder.
      setLines([newLine()]);
    } catch (caught) {
      setServerError(
        caught instanceof Error ? caught.message : 'Gagal menyimpan alokasi.',
      );
    }
  };

  const handleRevoke = async (allocationId: string) => {
    setServerError(null);
    try {
      await revokeAllocation.mutateAsync(allocationId);
    } catch (caught) {
      setServerError(
        caught instanceof Error ? caught.message : 'Gagal membatalkan alokasi.',
      );
    }
  };

  const isPending = createAllocations.isPending || revokeAllocation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[680px]">
        <form onSubmit={handleSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>Bagi Alokasi Transaksi</DialogTitle>
            <DialogDescription>
              Pecah satu mutasi bank untuk dicocokkan ke beberapa catatan
              pembukuan.
            </DialogDescription>
          </DialogHeader>

          {/* DESIGN.md §12.3 Bank Reconciliation Split-Allocation: Bank Transaction / Allocated / Remaining, font-mono. */}
          <div className="mt-4 grid grid-cols-3 gap-2 rounded-sm border border-border-default bg-surface-muted/60 p-3 text-xs">
            <div>
              <span className="block text-[11px] text-text-tertiary">
                Transaksi Bank
              </span>
              <span
                data-testid="split-transaction-amount"
                className="numeric font-mono font-semibold text-text-primary"
              >
                {formatCurrency(transaction?.amount)}
              </span>
            </div>
            <div>
              <span className="block text-[11px] text-text-tertiary">
                Teralokasi
              </span>
              <span
                data-testid="split-allocated"
                className="numeric font-mono font-semibold text-text-primary"
              >
                {formatCurrency(toMoneyString(summary.allocated))}
              </span>
            </div>
            <div>
              <span className="block text-[11px] text-text-tertiary">Sisa</span>
              <span
                data-testid="split-remaining"
                className={`numeric font-mono font-semibold ${summary.overAllocated ? 'text-status-danger' : 'text-text-primary'}`}
              >
                {formatCurrency(toMoneyString(summary.remaining))}
              </span>
            </div>
          </div>

          {summary.overAllocated && (
            <Alert
              variant="destructive"
              className="mt-3"
              data-testid="split-over-allocated"
            >
              <AlertCircle className="size-4" />
              <AlertDescription>
                Total alokasi melebihi jumlah transaksi bank (
                {formatCurrency(transaction?.amount)}). Kurangi salah satu
                baris.
              </AlertDescription>
            </Alert>
          )}

          {/* Already-saved allocations — visibly separate from the draft rows. */}
          <div className="mt-4 space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Alokasi Tersimpan
            </h3>
            {allocationsLoading ? (
              <p className="text-xs text-text-tertiary">Memuat…</p>
            ) : allocations.length === 0 ? (
              <p className="text-xs text-text-tertiary">
                Belum ada alokasi tersimpan.
              </p>
            ) : (
              <ul className="space-y-1.5" data-testid="saved-allocations">
                {allocations.map((allocation) => (
                  <li
                    key={allocation.id}
                    className="flex items-center justify-between gap-2 rounded-sm border border-border-default p-2 text-xs"
                  >
                    <span className="min-w-0 truncate text-text-secondary">
                      {entryLabel(allocation.ledgerEntry)}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="numeric font-mono font-semibold text-text-primary">
                        {formatCurrency(allocation.amountPortion)}
                      </span>
                      {allocation.status === 'REVOKED' ? (
                        <Badge variant="outline" className="text-[11px]">
                          Dibatalkan
                        </Badge>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={isPending}
                          onClick={() => handleRevoke(allocation.id)}
                        >
                          Batalkan
                        </Button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Draft rows — DESIGN.md §12.3 Bank Reconciliation Split-Allocation's "allocation rows". */}
          <div className="mt-4 flex flex-col gap-3 rounded-sm border border-border-default bg-surface-muted/60 p-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                Baris Alokasi Baru
              </h3>
              <Input
                type="search"
                value={entryFilter}
                onChange={(event) => setEntryFilter(event.target.value)}
                placeholder="Cari catatan pembukuan…"
                aria-label="Cari catatan pembukuan"
                className="h-6 max-w-[220px] text-xs"
              />
            </div>

            {lines.map((line, index) => {
              const state = summary.lineStates[line.id];
              const message = state ? DRAFT_LINE_MESSAGES[state] : '';
              return (
                <div key={line.id} className="flex flex-col justify-between">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <div className="min-w-0 flex-1 flex-col gap-1.5 sm:flex">
                      <Label htmlFor={`split-entry-${index}`}>
                        Catatan Pembukuan
                      </Label>
                      <Select
                        value={line.ledgerEntryId || undefined}
                        onValueChange={(value) =>
                          updateLine(line.id, { ledgerEntryId: value })
                        }
                      >
                        <SelectTrigger
                          id={`split-entry-${index}`}
                          data-testid={`split-entry-${index}`}
                          aria-invalid={Boolean(message)}
                        >
                          <SelectValue placeholder="-- Pilih Catatan --" />
                        </SelectTrigger>
                        <SelectContent>
                          {entryOptions.map((entry) => (
                            <SelectItem key={entry.id} value={entry.id}>
                              {allocatedEntryIds.has(entry.id) ? '• ' : ''}
                              {entryLabel(entry)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="w-full flex flex-col gap-1.5 sm:w-44">
                      <Label htmlFor={`split-amount-${index}`}>Jumlah</Label>
                      <CurrencyInput
                        id={`split-amount-${index}`}
                        data-testid={`split-amount-${index}`}
                        value={line.amountPortion}
                        aria-invalid={Boolean(message)}
                        onChange={(value) =>
                          updateLine(line.id, { amountPortion: value })
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      aria-label={`Hapus baris ${index + 1}`}
                      disabled={lines.length === 1}
                      className="w-full sm:w-10"
                      onClick={() =>
                        setLines((previous) =>
                          previous.filter((item) => item.id !== line.id),
                        )
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>

                  {message && (
                    <p
                      role="alert"
                      data-testid={`split-line-error-${index}`}
                      className="text-xs text-status-danger"
                    >
                      {message}
                    </p>
                  )}
                </div>
              );
            })}

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setLines((previous) => [...previous, newLine()])}
            >
              <Plus className="size-4" />
              Tambah Baris
            </Button>

            <p className="text-xs text-text-tertiary">
              Tanda • menandai catatan pembukuan yang sudah punya alokasi aktif
              pada transaksi ini.
            </p>
          </div>

          {serverError && (
            <Alert
              variant="destructive"
              className="mt-4"
              data-testid="split-server-error"
            >
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          <DialogFooter className="mt-6 gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => onOpenChange(false)}
            >
              Tutup
            </Button>
            <Button type="submit" disabled={isPending || !summary.submittable}>
              {createAllocations.isPending ? 'Menyimpan…' : 'Simpan Alokasi'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
