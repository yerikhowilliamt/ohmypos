'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@ohmypos/ui/components/badge';
import { Skeleton } from '@ohmypos/ui/components/skeleton';
import { DataTable, SortableHeader } from '@/components/ui/data-table';
import type { ExportColumn } from '@/lib/export';
import { formatQuantity } from '@/lib/formatters';
import {
  formatStockStatus,
  getFlowIndicatorClasses,
  getStockStatusBadgeClasses,
} from '@/lib/vocabulary';
import type { InventorySummaryRow } from '@ohmypos/api-contracts';

interface InventorySummaryTableProps {
  rows: InventorySummaryRow[];
  isLoading?: boolean;
  /** `YYYY-MM` period the summary was fetched for — only used to name the export file. */
  period?: string;
}

const columns: ColumnDef<InventorySummaryRow>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <SortableHeader label="Bahan Baku" column={column} />
    ),
    cell: ({ row }) => (
      <div>
        <div className="font-medium text-text-primary">{row.original.name}</div>
        <div className="text-xs text-text-tertiary">{row.original.unit}</div>
      </div>
    ),
    filterFn: 'includesString',
  },
  {
    accessorFn: (row) => Number(row.openingQuantity),
    id: 'openingQuantity',
    header: ({ column }) => (
      <SortableHeader label="Stok Awal" column={column} align="right" />
    ),
    cell: ({ row }) => (
      <span className="font-mono tabular-nums text-text-primary">
        {formatQuantity(row.original.openingQuantity)}
      </span>
    ),
    meta: { align: 'right' },
  },
  {
    accessorFn: (row) => Number(row.inQuantity),
    id: 'inQuantity',
    header: ({ column }) => (
      <SortableHeader label="Masuk" column={column} align="right" />
    ),
    cell: ({ row }) => (
      <span
        className={`font-mono tabular-nums ${getFlowIndicatorClasses('IN')}`}
      >
        {formatQuantity(row.original.inQuantity)}
      </span>
    ),
    meta: { align: 'right' },
  },
  {
    accessorFn: (row) => Number(row.outQuantity),
    id: 'outQuantity',
    header: ({ column }) => (
      <SortableHeader label="Keluar" column={column} align="right" />
    ),
    cell: ({ row }) => (
      <span
        className={`font-mono tabular-nums ${getFlowIndicatorClasses('OUT')}`}
      >
        {formatQuantity(row.original.outQuantity)}
      </span>
    ),
    meta: { align: 'right' },
  },
  {
    accessorFn: (row) => Number(row.closingQuantity),
    id: 'closingQuantity',
    header: ({ column }) => (
      <SortableHeader label="Stok Akhir" column={column} align="right" />
    ),
    cell: ({ row }) => (
      <span className="font-mono tabular-nums font-semibold text-text-primary">
        {formatQuantity(row.original.closingQuantity)}
      </span>
    ),
    meta: { align: 'right' },
  },
  {
    accessorFn: (row) => Number(row.lowStockThreshold),
    id: 'lowStockThreshold',
    header: ({ column }) => (
      <SortableHeader label="Batas Minimum" column={column} align="right" />
    ),
    cell: ({ row }) => (
      <span className="font-mono tabular-nums text-text-tertiary">
        {formatQuantity(row.original.lowStockThreshold)}
      </span>
    ),
    meta: { align: 'right' },
  },
  {
    accessorKey: 'status',
    header: ({ column }) => <SortableHeader label="Status" column={column} />,
    cell: ({ row }) => (
      <Badge
        className={getStockStatusBadgeClasses(row.original.status)}
        aria-label={`Status stok: ${formatStockStatus(row.original.status)}`}
      >
        {formatStockStatus(row.original.status)}
      </Badge>
    ),
    filterFn: 'equalsString',
  },
];

const exportColumns: ExportColumn<InventorySummaryRow>[] = [
  { header: 'Bahan Baku', accessor: (row) => row.name },
  { header: 'Satuan', accessor: (row) => row.unit },
  { header: 'Stok Awal', accessor: (row) => Number(row.openingQuantity) },
  { header: 'Masuk', accessor: (row) => Number(row.inQuantity) },
  { header: 'Keluar', accessor: (row) => Number(row.outQuantity) },
  { header: 'Stok Akhir', accessor: (row) => Number(row.closingQuantity) },
  {
    header: 'Batas Minimum',
    accessor: (row) => Number(row.lowStockThreshold),
  },
  { header: 'Status', accessor: (row) => formatStockStatus(row.status) },
];

/**
 * Dashboard 5 (PRD §5.6) — read-only inventory summary table.
 *
 * Every number comes from the server (GET /inventory/summary) — nothing is
 * recomputed client-side. Search and sort are provided by the shared DataTable
 * (shadcn pattern); in/out columns carry the Flow Indicator motif
 * (DESIGN.md §12.2 Signature Flow Indicator) and the status column uses the shared stock-status badge
 * (DESIGN.md §16 Status Badges, vocabulary.ts).
 */
export function InventorySummaryTable({
  rows,
  isLoading = false,
  period,
}: InventorySummaryTableProps) {
  if (isLoading) {
    return (
      <div className="rounded-md border border-border-default bg-surface-raised overflow-hidden">
        <div className="p-4 space-y-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>
    );
  }

  return (
    <DataTable
      columns={columns}
      data={rows}
      searchColumns={['name']}
      searchPlaceholder="Cari bahan baku..."
      searchLabel="Cari bahan baku"
      emptyMessage="Tidak ada data stok"
      emptyDescription="Belum ada bahan baku atau pergerakan stok pada periode ini."
      exportColumns={exportColumns}
      exportFilename={`ringkasan-stok_${period ?? new Date().toISOString().slice(0, 7)}.xlsx`}
    />
  );
}
