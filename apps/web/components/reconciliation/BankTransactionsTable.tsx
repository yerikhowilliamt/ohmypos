'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import type { BankTransactionResponse } from '@ohmypos/api-contracts';
import { Badge } from '@ohmypos/ui/components/badge';
import { Button } from '@ohmypos/ui/components/button';
import { DataTable, SortableHeader } from '@/components/ui/data-table';
import { formatCurrency } from '@/lib/formatters';
import {
  formatTransactionStatus,
  formatTransactionType,
  getFlowIndicatorClasses,
  getTransactionStatusBadgeClasses,
} from '@/lib/vocabulary';

interface BankTransactionsTableProps {
  transactions: BankTransactionResponse[];
  isLoading: boolean;
  onAllocate: (transaction: BankTransactionResponse) => void;
}

export function BankTransactionsTable({
  transactions,
  isLoading,
  onAllocate,
}: BankTransactionsTableProps) {
  const columns = React.useMemo<ColumnDef<BankTransactionResponse>[]>(
    () => [
      {
        accessorFn: (row) => new Date(row.txnDate).getTime(),
        id: 'txnDate',
        header: ({ column }) => (
          <SortableHeader label="Tanggal" column={column} />
        ),
        cell: ({ row }) => (
          <span className="text-text-secondary">
            {new Date(row.original.txnDate).toLocaleDateString('id-ID')}
          </span>
        ),
      },
      {
        accessorKey: 'description',
        filterFn: 'includesString',
        header: ({ column }) => (
          <SortableHeader label="Keterangan" column={column} />
        ),
        cell: ({ row }) => (
          <span className="text-text-primary">{row.original.description}</span>
        ),
      },
      {
        accessorKey: 'type',
        header: 'Arah',
        cell: ({ row }) => (
          <span
            className={`text-xs font-medium ${getFlowIndicatorClasses(row.original.type)}`}
          >
            {formatTransactionType(row.original.type)}
          </span>
        ),
      },
      {
        accessorFn: (row) => Number(row.amount),
        id: 'amount',
        header: ({ column }) => (
          <SortableHeader label="Jumlah" column={column} align="right" />
        ),
        cell: ({ row }) => (
          <span
            className={`numeric font-mono font-medium ${getFlowIndicatorClasses(row.original.type)}`}
          >
            {formatCurrency(row.original.amount)}
          </span>
        ),
        meta: { align: 'right' },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <Badge
            className={`text-[11px] ${getTransactionStatusBadgeClasses(row.original.status)}`}
          >
            {formatTransactionStatus(row.original.status)}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onAllocate(row.original)}
          >
            Alokasi
          </Button>
        ),
        meta: { align: 'right' },
      },
    ],
    [onAllocate],
  );

  return (
    <DataTable
      columns={columns}
      data={transactions}
      isLoading={isLoading}
      searchColumns={['description']}
      searchPlaceholder="Cari keterangan…"
      emptyMessage="Belum ada transaksi bank."
      emptyDescription="Impor rekening koran CSV untuk mulai merekonsiliasi."
    />
  );
}
