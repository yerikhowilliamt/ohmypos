'use client';

import type { ReconciliationSummary } from '@ohmypos/api-contracts';
import { Card, CardContent } from '@ohmypos/ui/components/card';
import { Skeleton } from '@ohmypos/ui/components/skeleton';
import { formatCurrency } from '@/lib/formatters';
import { TRANSACTION_STATUS_LABELS } from '@/lib/vocabulary';
import { getFlowIndicatorClassesForAmount } from '@/lib/vocabulary';

interface ReconciliationSummaryCardsProps {
  summary?: ReconciliationSummary;
  isLoading: boolean;
}

/**
 * Status counts plus the bank-vs-ledger variance from GET /reconciliation/summary.
 * Every figure is server-computed (reconciliation.service.ts:38, ADR-008) —
 * nothing here is recomputed client-side.
 */
export function ReconciliationSummaryCards({
  summary,
  isLoading,
}: ReconciliationSummaryCardsProps) {
  if (isLoading || !summary) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            'UNRESOLVED',
            'PENDING_REVIEW',
            'PARTIALLY_ALLOCATED',
            'MATCHED',
          ] as const
        ).map((status) => (
          <Card key={status}>
            <CardContent className="p-4">
              <p className="text-xs text-text-tertiary">
                {TRANSACTION_STATUS_LABELS[status]}
              </p>
              <p
                data-testid={`summary-count-${status}`}
                className="numeric mt-1 font-mono text-xl font-semibold text-text-primary"
              >
                {summary.counts[status]}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-text-tertiary">Saldo Bank (Aktual)</p>
            <p className="numeric mt-1 font-mono text-base font-semibold text-text-primary">
              {formatCurrency(summary.actualBankBalance)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-text-tertiary">Saldo Pembukuan</p>
            <p className="numeric mt-1 font-mono text-base font-semibold text-text-primary">
              {formatCurrency(summary.recordedLedgerBalance)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-text-tertiary">Selisih</p>
            <p
              data-testid="summary-variance"
              className={`numeric mt-1 font-mono text-base font-semibold ${getFlowIndicatorClassesForAmount(summary.variance)}`}
            >
              {formatCurrency(summary.variance)}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
