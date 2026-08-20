'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Button } from '@ohmypos/ui/components/button';
import { Badge } from '@ohmypos/ui/components/badge';
import { Plus } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import { formatLedgerSourceType } from '@/lib/vocabulary';
import { useLedgerEntries } from '@/hooks/useExpenses';
import { DataTable, SortableHeader } from '@/components/ui/data-table';
import type { ExportColumn } from '@/lib/export';
import type { LedgerEntryResponse } from '@ohmypos/api-contracts';
import { GeneralExpenseFormDialog } from './GeneralExpenseFormDialog';

const columns: ColumnDef<LedgerEntryResponse>[] = [
  {
    accessorFn: (row) => new Date(row.entryDate).getTime(),
    id: 'entryDate',
    header: ({ column }) => <SortableHeader label="Tanggal" column={column} />,
    cell: ({ row }) => (
      <span className="text-text-secondary">
        {new Date(row.original.entryDate).toLocaleDateString('id-ID')}
      </span>
    ),
  },
  {
    accessorKey: 'note',
    header: ({ column }) => <SortableHeader label="Catatan" column={column} />,
    cell: ({ row }) => (
      <span className="text-text-primary">
        {row.original.note ?? <span className="text-text-tertiary">—</span>}
      </span>
    ),
  },
  {
    accessorKey: 'sourceType',
    filterFn: 'includesString',
    header: ({ column }) => <SortableHeader label="Sumber" column={column} />,
    cell: ({ row }) => (
      <Badge
        variant={row.original.sourceType === 'MANUAL' ? 'outline' : 'secondary'}
        className="text-[11px]"
      >
        {formatLedgerSourceType(row.original.sourceType)}
      </Badge>
    ),
  },
  {
    accessorFn: (row) => Number(row.amount),
    id: 'amount',
    header: ({ column }) => (
      <SortableHeader label="Jumlah" column={column} align="right" />
    ),
    cell: ({ row }) => (
      <span className="numeric font-mono font-medium text-accent-outflow">
        {formatCurrency(row.original.amount)}
      </span>
    ),
    meta: { align: 'right' },
  },
];

const exportColumns: ExportColumn<LedgerEntryResponse>[] = [
  { header: 'Tanggal', accessor: (row) => new Date(row.entryDate) },
  { header: 'Catatan', accessor: (row) => row.note ?? '' },
  {
    header: 'Sumber',
    accessor: (row) => formatLedgerSourceType(row.sourceType),
  },
  { header: 'Jumlah (IDR)', accessor: (row) => Number(row.amount) },
];

export function GeneralExpenseTab() {
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const { data, isLoading } = useLedgerEntries();
  const entries = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">
            Pengeluaran Umum
          </h2>
          <p className="text-xs text-text-secondary">
            Semua pengeluaran (OUTFLOW) — manual maupun hasil
            pembelian/pelunasan utang.
          </p>
        </div>
        <Button
          onClick={() => setIsCreateOpen(true)}
          className="gap-2 shrink-0 w-full md:w-auto"
        >
          <Plus className="size-4" />
          Tambah Pengeluaran
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={entries}
        isLoading={isLoading}
        emptyMessage="Belum ada pengeluaran tercatat."
        exportColumns={exportColumns}
        exportFilename={`pengeluaran-umum_${new Date().toISOString().slice(0, 10)}.xlsx`}
      />

      <GeneralExpenseFormDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
      />
    </div>
  );
}
