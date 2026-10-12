'use client';

import * as React from 'react';
import type {
  StockDirection,
  StockMovementResponse,
  StockReferenceType,
} from '@ohmypos/api-contracts';
import type {
  ColumnDef,
  OnChangeFn,
  SortingState,
} from '@tanstack/react-table';
import {
  DataTable,
  SortableHeader,
  type DataTablePagination,
} from '@/components/ui/data-table';
import { formatCurrency, formatQuantity } from '@/lib/formatters';
import type { ExportColumn } from '@/lib/export';
import { ChevronDown, ChevronUp } from 'lucide-react';

/**
 * Row-level stock movement log, server-sorted and paged. No running-balance
 * column on purpose: it is undefined under paging, sorting and filtering.
 */
const REFERENCE_TYPE_LABEL: Record<StockReferenceType, string> = {
  SALE: 'Penjualan',
  PURCHASE: 'Pembelian',
  OPENING: 'Stok Awal',
  ADJUSTMENT: 'Penyesuaian',
};

/** Direction is carried by chevron and word, not colour alone (DESIGN.md §12.2). */
function DirectionIndicator({ direction }: { direction: StockDirection }) {
  const isInflow = direction === 'IN';
  const Icon = isInflow ? ChevronUp : ChevronDown;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold ${
        isInflow ? 'text-accent-inflow' : 'text-accent-outflow'
      }`}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {isInflow ? 'Masuk' : 'Keluar'}
    </span>
  );
}

/** Plain-value export columns. */
const exportColumns: ExportColumn<StockMovementResponse>[] = [
  { header: 'Tanggal', accessor: (row) => new Date(row.movementDate) },
  { header: 'Bahan Baku', accessor: (row) => row.rawMaterialName },
  {
    header: 'Arah',
    accessor: (row) => (row.direction === 'IN' ? 'Masuk' : 'Keluar'),
  },
  { header: 'Jumlah', accessor: (row) => Number(row.quantity) },
  { header: 'Satuan', accessor: (row) => row.rawMaterialUnit },
  {
    header: 'Harga Satuan (IDR)',
    accessor: (row) => Number(row.unitCostAtMovement),
  },
  {
    header: 'Sumber',
    accessor: (row) => REFERENCE_TYPE_LABEL[row.referenceType],
  },
  { header: 'Cabang', accessor: (row) => row.branchName ?? 'Umum' },
];

interface StockMovementsTableProps {
  movements: StockMovementResponse[];
  isLoading?: boolean;
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
  pagination: DataTablePagination;
  /** Raw search text, owned by StockMovementsClient. */
  search: string;
  onSearchChange: (value: string) => void;
  /** Whole filtered set for Export — `movements` is one page (DEBT-048). */
  exportAll: () => Promise<StockMovementResponse[]>;
  /** Filename built from the client's date-range filter (DEBT-025). */
  exportFilename: string;
}

export function StockMovementsTable({
  movements,
  isLoading = false,
  sorting,
  onSortingChange,
  pagination,
  search,
  onSearchChange,
  exportAll,
  exportFilename,
}: StockMovementsTableProps) {
  const columns = React.useMemo<ColumnDef<StockMovementResponse>[]>(
    () => [
      {
        accessorKey: 'movementDate',
        header: ({ column }) => (
          <SortableHeader label="Tanggal" column={column} />
        ),
        cell: ({ row }) => {
          // movementDate: stock-takes are dated to the period start (ADR-018).
          const d = new Date(row.original.movementDate);
          return (
            <div className="flex flex-col">
              <span className="font-medium text-text-primary text-xs">
                {d.toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
              <span className="text-[11px] text-text-tertiary font-mono">
                {d.toLocaleTimeString('id-ID', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: 'rawMaterialName',
        header: ({ column }) => (
          <SortableHeader label="Bahan Baku" column={column} />
        ),
        cell: ({ row }) => (
          <span className="font-medium text-text-primary text-xs">
            {row.original.rawMaterialName}
          </span>
        ),
      },
      {
        accessorKey: 'direction',
        header: 'Arah',
        cell: ({ row }) => (
          <DirectionIndicator direction={row.original.direction} />
        ),
      },
      {
        accessorKey: 'quantity',
        header: ({ column }) => (
          <SortableHeader label="Jumlah" column={column} align="right" />
        ),
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="numeric font-mono text-xs font-semibold text-text-primary">
            {formatQuantity(Number(row.original.quantity))}{' '}
            <span className="font-sans font-normal text-text-tertiary">
              {row.original.rawMaterialUnit}
            </span>
          </span>
        ),
      },
      {
        accessorKey: 'unitCostAtMovement',
        header: ({ column }) => (
          <SortableHeader label="Harga Satuan" column={column} align="right" />
        ),
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="numeric font-mono text-xs text-text-secondary">
            {formatCurrency(row.original.unitCostAtMovement)}
          </span>
        ),
      },
      {
        accessorKey: 'referenceType',
        header: 'Sumber',
        cell: ({ row }) => (
          <span className="inline-flex items-center rounded-sm bg-surface-muted px-2 py-0.5 text-xs font-medium text-text-secondary">
            {REFERENCE_TYPE_LABEL[row.original.referenceType]}
          </span>
        ),
      },
      {
        accessorKey: 'branchName',
        header: 'Cabang',
        cell: ({ row }) => (
          // Null branch = central event, shown as "Pusat".
          <span className="text-xs text-text-secondary">
            {row.original.branchName ?? 'Umum'}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      data={movements}
      isLoading={isLoading}
      sorting={sorting}
      onSortingChange={onSortingChange}
      pagination={pagination}
      serverSearch={{ value: search, onChange: onSearchChange }}
      searchPlaceholder="Cari bahan baku atau cabang..."
      searchLabel="Cari pergerakan stok"
      emptyMessage="Belum ada pergerakan stok pada rentang ini. Coba ubah filternya."
      emptyDescription="Setiap penjualan, pembelian, dan stok awal tercatat di sini."
      exportColumns={exportColumns}
      exportFilename={exportFilename}
      exportAll={exportAll}
      exportTotal={pagination.meta.total}
    />
  );
}
