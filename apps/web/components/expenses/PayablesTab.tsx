'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Card, CardContent } from '@ohmypos/ui/components/card';
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
import { DataTable, SortableHeader } from '@/components/ui/data-table';
import type { ExportColumn } from '@/lib/export';
import { PayableSettlementDialog } from './PayableSettlementDialog';

const exportColumns: ExportColumn<PayableResponse>[] = [
  { header: 'Pemasok', accessor: (row) => row.supplierName },
  {
    header: 'Jumlah Awal (IDR)',
    accessor: (row) => Number(row.originalAmount),
  },
  {
    header: 'Sisa Utang (IDR)',
    accessor: (row) => Number(row.remainingBalance),
  },
  { header: 'Status', accessor: (row) => formatPayableStatus(row.status) },
];

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

  // Columns live in-component: the Aksi cell closes over setSettlingPayable.
  const columns: ColumnDef<PayableResponse>[] = [
    {
      accessorKey: 'supplierName',
      header: ({ column }) => (
        <SortableHeader label="Pemasok" column={column} />
      ),
      cell: ({ row }) => (
        <span className="font-medium text-text-primary">
          {row.original.supplierName}
        </span>
      ),
    },
    {
      accessorFn: (row) => Number(row.originalAmount),
      id: 'originalAmount',
      header: ({ column }) => (
        <SortableHeader label="Jumlah Awal" column={column} align="right" />
      ),
      cell: ({ row }) => (
        <span className="numeric font-mono text-text-secondary">
          {formatCurrency(row.original.originalAmount)}
        </span>
      ),
      meta: { align: 'right' },
    },
    {
      accessorFn: (row) => Number(row.remainingBalance),
      id: 'remainingBalance',
      header: ({ column }) => (
        <SortableHeader label="Sisa Utang" column={column} align="right" />
      ),
      cell: ({ row }) => (
        <span className="numeric font-mono font-medium text-status-danger">
          {formatCurrency(row.original.remainingBalance)}
        </span>
      ),
      meta: { align: 'right' },
    },
    {
      accessorFn: (row) => row.status,
      id: 'status',
      filterFn: 'equalsString',
      header: ({ column }) => <SortableHeader label="Status" column={column} />,
      cell: ({ row }) => (
        <Badge
          className={`text-[11px] ${payableBadgeClasses(row.original.status)}`}
        >
          {formatPayableStatus(row.original.status)}
        </Badge>
      ),
      meta: { align: 'center' },
    },
    {
      header: 'Aksi',
      cell: ({ row }) => (
        <Button
          variant="outline"
          size="sm"
          disabled={row.original.status === 'SETTLED'}
          onClick={() => setSettlingPayable(row.original)}
        >
          Bayar
        </Button>
      ),
      meta: { align: 'center' },
    },
  ];

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

      <DataTable
        columns={columns}
        data={payables}
        isLoading={isLoading}
        emptyMessage="Belum ada utang tercatat."
        exportColumns={exportColumns}
        exportFilename={`utang-pemasok_${new Date().toISOString().slice(0, 10)}.xlsx`}
      />

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
