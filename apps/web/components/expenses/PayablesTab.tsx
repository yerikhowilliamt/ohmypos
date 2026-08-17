'use client';

import * as React from 'react';
import { Card, CardContent } from '@ohmypos/ui/components/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ohmypos/ui/components/table';
import { Badge } from '@ohmypos/ui/components/badge';
import { Button } from '@ohmypos/ui/components/button';
import { HandCoins, Wallet } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import {
  formatPayableStatus,
  getPaymentStatusBadgeClasses,
} from '@/lib/vocabulary';
import type { PayableResponse } from '@ohmypos/api-contracts';
import { usePayables, usePayablesSummary } from '@/hooks/useExpenses';
import { PayableSettlementDialog } from './PayableSettlementDialog';

/** PayableStatus and PaymentStatus share the same three-tier semantics
 * (open/partial/settled vs unpaid/partial/paid) — the shared badge palette
 * from `lib/vocabulary.ts` already maps both correctly. */
function payableBadgeClasses(status: PayableResponse['status']) {
  if (status === 'SETTLED') return getPaymentStatusBadgeClasses('PAID');
  if (status === 'PARTIALLY_SETTLED')
    return getPaymentStatusBadgeClasses('PARTIALLY_PAID');
  return getPaymentStatusBadgeClasses('UNPAID');
}

export function PayablesTab() {
  const [settlingPayable, setSettlingPayable] =
    React.useState<PayableResponse | null>(null);
  const { data, isLoading } = usePayables();
  const { data: summary = [] } = usePayablesSummary();
  const payables = data?.data ?? [];

  const totalOutstanding = summary.reduce(
    (sum, s) => sum + Number(s.totalOutstanding),
    0,
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-text-primary">
          Utang / Pembayaran Pemasok
        </h2>
        <p className="text-xs text-text-secondary">
          Saldo utang berjalan per pemasok, dengan pelunasan sebagian atau
          penuh.
        </p>
      </div>

      {/* Per-supplier running balance summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-3 shadow-1 bg-surface-raised border-border-default">
          <CardContent className="p-0 flex items-center justify-between">
            <div>
              <p className="text-xs text-text-tertiary">Total Utang Terbuka</p>
              <p className="mt-1 text-lg font-bold font-mono text-status-danger">
                {formatCurrency(String(totalOutstanding))}
              </p>
              <p className="text-[11px] text-text-secondary mt-0.5">
                {summary.length} pemasok
              </p>
            </div>
            <div className="size-9 rounded-sm bg-status-danger flex items-center justify-center text-white shadow-1">
              <Wallet className="size-5 text-white" />
            </div>
          </CardContent>
        </Card>

        {summary.slice(0, 3).map((s) => (
          <Card
            key={s.supplierId}
            className="p-3 shadow-1 bg-surface-raised border-border-default"
          >
            <CardContent className="p-0 flex items-center justify-between">
              <div>
                <p className="text-xs text-text-tertiary truncate max-w-[140px]">
                  {s.supplierName}
                </p>
                <p className="mt-1 text-lg font-bold font-mono text-text-primary">
                  {formatCurrency(s.totalOutstanding)}
                </p>
                <p className="text-[11px] text-text-secondary mt-0.5">
                  {s.openPayableCount} tagihan terbuka
                </p>
              </div>
              <div className="size-9 rounded-sm bg-surface-muted flex items-center justify-center text-text-tertiary shadow-1">
                <HandCoins className="size-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="rounded-md border border-border-default bg-surface-raised shadow-1 overflow-hidden">
        <Table className="min-w-[650px]">
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[200px]">Pemasok</TableHead>
              <TableHead className="text-right min-w-[130px]">
                Jumlah Awal
              </TableHead>
              <TableHead className="text-right min-w-[130px]">
                Sisa Utang
              </TableHead>
              <TableHead className="text-center min-w-[120px]">
                Status
              </TableHead>
              <TableHead className="text-center min-w-[100px]">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-32 text-center text-text-secondary"
                >
                  Memuat data utang…
                </TableCell>
              </TableRow>
            ) : payables.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-32 text-center text-text-secondary"
                >
                  Belum ada utang tercatat.
                </TableCell>
              </TableRow>
            ) : (
              payables.map((payable) => (
                <TableRow key={payable.id}>
                  <TableCell className="font-medium text-text-primary">
                    {payable.supplierName}
                  </TableCell>
                  <TableCell className="text-right numeric font-mono text-text-secondary">
                    {formatCurrency(payable.originalAmount)}
                  </TableCell>
                  <TableCell className="text-right numeric font-mono font-medium text-status-danger">
                    {formatCurrency(payable.remainingBalance)}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge
                      className={`text-[11px] ${payableBadgeClasses(payable.status)}`}
                    >
                      {formatPayableStatus(payable.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={payable.status === 'SETTLED'}
                      onClick={() => setSettlingPayable(payable)}
                    >
                      Bayar
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <PayableSettlementDialog
        open={Boolean(settlingPayable)}
        onOpenChange={(open) => {
          if (!open) setSettlingPayable(null);
        }}
        payable={settlingPayable}
      />
    </div>
  );
}
