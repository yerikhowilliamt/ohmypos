'use client';

import * as React from 'react';
import { Check, RefreshCw, Wand2, X } from 'lucide-react';
import type {
  BankTransactionResponse,
  MatchCandidate,
} from '@ohmypos/api-contracts';
import { Alert, AlertDescription } from '@ohmypos/ui/components/alert';
import { Badge } from '@ohmypos/ui/components/badge';
import { Button } from '@ohmypos/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@ohmypos/ui/components/card';
import { formatCurrency } from '@/lib/formatters';
import {
  MATCH_TYPE_LABELS,
  buildAllocationsForCandidate,
  candidateKey,
  formatConfidence,
} from '@/lib/reconciliation/match-candidates';
import {
  useCreateAllocations,
  usePendingReviewTransactions,
  useProposeMatches,
  useRejectMatch,
  useResetMatches,
} from '@/hooks/useReconciliation';

interface MatchReviewQueueProps {
  accountId?: string;
}

/**
 * The auto-match review queue (PRD §5.7).
 *
 * Three things about the backend shape this screen, and none of them are
 * cosmetic:
 *
 * 1. `POST /matching/propose` WRITES — it flips every matched transaction from
 *    UNRESOLVED to PENDING_REVIEW (matching.service.ts:70). So it runs only when
 *    the operator presses the button, never on mount and never on refocus.
 * 2. Candidates are NOT persisted; they exist only in that response. A reload
 *    empties the queue, and re-running propose will NOT re-propose the
 *    transactions it already moved to PENDING_REVIEW (matching.service.ts:19
 *    only selects UNRESOLVED). The way back is "Reset Status Pencocokan".
 * 3. "Abaikan" calls `POST /matching/reject/:bankTransactionId` once per
 *    `bankTransactionId` in the candidate (an AGGREGATION candidate can carry
 *    several) and only removes the candidate from the queue once every call
 *    succeeds — it returns that transaction's status to UNRESOLVED, it does
 *    NOT merely hide it locally (matching.service.ts `rejectMatch`).
 */
export function MatchReviewQueue({ accountId }: MatchReviewQueueProps) {
  const [candidates, setCandidates] = React.useState<MatchCandidate[] | null>(
    null,
  );
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set());
  const [error, setError] = React.useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = React.useState(false);

  const proposeMutation = useProposeMatches();
  const resetMutation = useResetMatches();
  const createAllocations = useCreateAllocations();
  const rejectMatch = useRejectMatch();
  const { data: pending } = usePendingReviewTransactions(
    accountId,
    candidates !== null,
  );

  const transactionsById = React.useMemo(() => {
    const map: Record<string, BankTransactionResponse> = {};
    for (const transaction of pending ?? []) {
      map[transaction.id] = transaction;
    }
    return map;
  }, [pending]);

  // A filter change invalidates the queue: it was computed for the old scope.
  React.useEffect(() => {
    // Resetting local queue state when the `accountId` filter prop changes,
    // not synchronizing with an external system; there is no derivation that
    // avoids the reset without restructuring this into a keyed remount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCandidates(null);
    setDismissed(new Set());
    setError(null);
  }, [accountId]);

  const visible = (candidates ?? []).filter(
    (candidate) => !dismissed.has(candidateKey(candidate)),
  );

  const handlePropose = async () => {
    setError(null);
    try {
      setDismissed(new Set());
      setCandidates(
        await proposeMutation.mutateAsync(accountId ? { accountId } : {}),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Gagal menjalankan pencocokan otomatis.',
      );
    }
  };

  const handleAccept = async (candidate: MatchCandidate) => {
    setError(null);
    const built = buildAllocationsForCandidate(
      candidate,
      transactionsById,
      () => crypto.randomUUID(),
    );

    if (!built.ok) {
      setError(
        built.reason === 'UNKNOWN_TRANSACTION'
          ? 'Data transaksi bank untuk usulan ini belum termuat. Jalankan ulang pencocokan otomatis.'
          : 'Jumlah transaksi bank tidak lagi cocok dengan usulan. Jalankan ulang pencocokan otomatis.',
      );
      return;
    }

    try {
      await createAllocations.mutateAsync(built.payload);
      setDismissed((prev) => new Set(prev).add(candidateKey(candidate)));
    } catch (caught) {
      // The backend is the authority on the allocation-sum invariant — show its
      // message verbatim rather than a paraphrase (Playbook §7).
      setError(
        caught instanceof Error ? caught.message : 'Gagal menyimpan alokasi.',
      );
    }
  };

  /**
   * "Abaikan" rejects EVERY bank transaction behind this candidate — an
   * AGGREGATION candidate can span several (matching.schema.ts:20) and the
   * reject endpoint is single-transaction. The candidate only leaves the queue
   * once all of them succeed; a partial failure leaves it visible with an
   * error so the operator can retry rather than silently losing track of a
   * transaction that is still PENDING_REVIEW.
   */
  const handleReject = async (candidate: MatchCandidate) => {
    setError(null);
    try {
      await Promise.all(
        candidate.bankTransactionIds.map((id) => rejectMatch.mutateAsync(id)),
      );
      setDismissed((prev) => new Set(prev).add(candidateKey(candidate)));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Gagal mengabaikan usulan ini.',
      );
    }
  };

  const handleReset = async () => {
    setError(null);
    try {
      await resetMutation.mutateAsync(accountId);
      setCandidates(null);
      setDismissed(new Set());
      setConfirmingReset(false);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Gagal mereset status.',
      );
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-base">
            Daftar Transaksi Perlu Dicocokkan
          </CardTitle>
          <CardDescription>
            Periksa transaksi yang disarankan sistem atau tentukan pencocokan
            manual.
          </CardDescription>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            type="button"
            onClick={handlePropose}
            disabled={proposeMutation.isPending}
            className="gap-2"
          >
            <Wand2 className="size-4" />
            {proposeMutation.isPending
              ? 'Mencocokkan…'
              : 'Jalankan Pencocokan Otomatis'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirmingReset(true)}
            disabled={resetMutation.isPending}
            className="gap-2"
          >
            <RefreshCw className="size-4" />
            Reset Status Pencocokan
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {confirmingReset && (
          <Alert variant="warning" data-testid="reset-confirm">
            <AlertDescription className="space-y-2">
              <p>
                Reset akan mengembalikan <strong>semua</strong> transaksi
                berstatus &quot;Perlu Ditinjau&quot;
                {accountId ? ' pada akun terpilih' : ''} menjadi &quot;Belum
                Cocok&quot;. Alokasi yang sudah tersimpan tidak terpengaruh.
              </p>
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={handleReset}>
                  Ya, Reset
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmingReset(false)}
                >
                  Batal
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive" data-testid="match-error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {candidates === null ? (
          <p className="text-sm text-text-secondary">
            Belum dijalankan. Usulan pencocokan tidak tersimpan — menjalankan
            ulang setelah halaman dimuat ulang hanya memeriksa transaksi yang
            masih berstatus &quot;Belum Cocok&quot;.
          </p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-text-secondary" data-testid="match-empty">
            Tidak ada usulan yang tersisa.
          </p>
        ) : (
          <ul className="space-y-2" data-testid="match-queue">
            {visible.map((candidate) => {
              const key = candidateKey(candidate);
              return (
                <li
                  key={key}
                  data-testid={`match-candidate-${key}`}
                  className="flex flex-col gap-3 rounded-md border border-border-default bg-surface-raised p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="info" className="text-[11px]">
                        {MATCH_TYPE_LABELS[candidate.matchType]}
                      </Badge>
                      <span className="text-xs text-text-secondary">
                        Keyakinan {formatConfidence(candidate.confidence)}
                      </span>
                      <span className="text-xs text-text-tertiary">
                        Selisih {candidate.dateDifferenceDays} hari
                      </span>
                    </div>
                    <p className="numeric font-mono text-sm font-semibold text-text-primary">
                      {formatCurrency(candidate.matchedAmount)}
                    </p>
                    <p className="text-xs text-text-tertiary">
                      {candidate.bankTransactionIds.length} transaksi bank → 1
                      catatan pembukuan
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleAccept(candidate)}
                      disabled={createAllocations.isPending}
                      className="gap-1.5"
                    >
                      <Check className="size-4" />
                      Terima
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleReject(candidate)}
                      disabled={rejectMatch.isPending}
                      className="gap-1.5"
                    >
                      <X className="size-4" />
                      Abaikan
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-xs text-text-tertiary">
          &quot;Abaikan&quot; mengembalikan transaksi bank pada usulan ini ke
          status &quot;Belum Cocok&quot;.
        </p>
      </CardContent>
    </Card>
  );
}
