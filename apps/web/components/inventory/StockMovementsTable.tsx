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
 * OhMyPos — the row-level stock movement log (TASK-070, PRD §5.6).
 *
 * Sorting and paging are entirely server-driven: `data` holds exactly one page,
 * so the table must not reorder it (DataTable switches to `manualSorting` when
 * both `sorting` and `onSortingChange` are supplied).
 *
 * There is deliberately no running-balance column. It is only definable for one
 * material, ordered by date ascending, over the whole history — on a screen that
 * pages, sorts five keys in two directions and filters four fields, a per-row
 * balance would be wrong in nearly every state the operator can reach, and wrong
 * silently. See the Tech Debt Log.
 */
const REFERENCE_TYPE_LABEL: Record<StockReferenceType, string> = {
  SALE: 'Penjualan',
  PURCHASE: 'Pembelian',
  OPENING: 'Stok Awal',
  ADJUSTMENT: 'Penyesuaian',
};

/**
 * DESIGN.md §12.2 Signature Flow Indicator. The chevron and the word carry the
 * meaning; colour only reinforces it. Encoding IN/OUT in colour alone would put
 * this table's central fact behind a §22 contrast failure — the same audit that
 * measured `#C5A880` at 2.26:1 against porcelain.
 */
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

/**
 * Raw values, not the JSX cells — a spreadsheet needs strings and numbers.
 * Exports only the CURRENT page, like every other table here (DEBT-048).
 */
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
  { header: 'Cabang', accessor: (row) => row.branchName ?? 'Pusat' },
];

interface StockMovementsTableProps {
  movements: StockMovementResponse[];
  isLoading?: boolean;
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
  pagination: DataTablePagination;
}

export function StockMovementsTable({
  movements,
  isLoading = false,
  sorting,
  onSortingChange,
  pagination,
}: StockMovementsTableProps) {
  const columns = React.useMemo<ColumnDef<StockMovementResponse>[]>(
    () => [
      {
        accessorKey: 'movementDate',
        header: ({ column }) => (
          <SortableHeader label="Tanggal" column={column} />
        ),
        cell: ({ row }) => {
          // movementDate, not createdAt: a stock-take entered on the 5th is
          // stamped with the period start, and the business date is the one the
          // operator is looking for (ADR-018).
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
          // Null branch is a CENTRAL event (a central purchase, a stock-take),
          // not missing data — most of this table, in fact. It reads "Pusat"
          // rather than leaving a blank cell the operator has to interpret.
          <span className="text-xs text-text-secondary">
            {row.original.branchName ?? 'Pusat'}
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
      // Search stays client-side and therefore covers only the rows on screen.
      // The placeholder says so rather than implying a full-history search the
      // backend does not offer (DEBT-047).
      searchColumns={['rawMaterialName', 'branchName']}
      searchPlaceholder="Cari bahan di halaman ini..."
      searchLabel="Cari bahan di halaman ini"
      emptyMessage="Belum ada pergerakan stok."
      emptyDescription="Setiap penjualan, pembelian, dan stok awal tercatat di sini."
      exportColumns={exportColumns}
      exportFilename={`pergerakan-stok_${new Date().toISOString().slice(0, 10)}.xlsx`}
    />
  );
}
