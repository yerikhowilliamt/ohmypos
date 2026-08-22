'use client';

import * as React from 'react';
import type {
  ColumnDef,
  OnChangeFn,
  SortingState,
} from '@tanstack/react-table';
import type { BankTransactionResponse } from '@ohmypos/api-contracts';
import { Badge } from '@ohmypos/ui/components/badge';
import { Button } from '@ohmypos/ui/components/button';
import {
  DataTable,
  SortableHeader,
  type DataTablePagination,
} from '@/components/ui/data-table';
import type { ExportColumn } from '@/lib/export';
import { formatCurrency } from '@/lib/formatters';
import {
  formatTransactionStatus,
  formatTransactionType,
  getFlowIndicatorClasses,
  getTransactionStatusBadgeClasses,
} from '@/lib/vocabulary';

const exportColumns: ExportColumn<BankTransactionResponse>[] = [
  { header: 'Tanggal', accessor: (row) => new Date(row.txnDate) },
  { header: 'Keterangan', accessor: (row) => row.description },
  { header: 'Arah', accessor: (row) => formatTransactionType(row.type) },
  { header: 'Jumlah (IDR)', accessor: (row) => Number(row.amount) },
  { header: 'Status', accessor: (row) => formatTransactionStatus(row.status) },
];

interface BankTransactionsTableProps {
  transactions: BankTransactionResponse[];
  isLoading: boolean;
  onAllocate: (transaction: BankTransactionResponse) => void;
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
  pagination: DataTablePagination;
}

export function BankTransactionsTable({
  transactions,
  isLoading,
  onAllocate,
  sorting,
  onSortingChange,
  pagination,
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

  // The search below is a client-side column filter and therefore only covers
  // the rows on screen; the placeholder says so rather than implying a
  // full-ledger search the backend does not offer (see DEBT-047).
  return (
    <DataTable
      columns={columns}
      data={transactions}
      isLoading={isLoading}
      sorting={sorting}
      onSortingChange={onSortingChange}
      pagination={pagination}
      searchColumns={['description']}
      searchPlaceholder="Cari keterangan di halaman ini…"
      searchLabel="Cari keterangan di halaman ini"
      emptyMessage="Belum ada transaksi bank."
      emptyDescription="Impor rekening koran CSV untuk mulai merekonsiliasi."
      exportColumns={exportColumns}
      exportFilename={`transaksi-bank_${new Date().toISOString().slice(0, 10)}.xlsx`}
    />
  );
}
