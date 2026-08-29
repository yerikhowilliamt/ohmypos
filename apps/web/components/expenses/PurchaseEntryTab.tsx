'use client';

import * as React from 'react';
import type {
  ColumnDef,
  OnChangeFn,
  SortingState,
} from '@tanstack/react-table';
import { Button } from '@ohmypos/ui/components/button';
import { ArrowRight, Plus } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import {
  formatPaymentStatus,
  getPaymentStatusBadgeClasses,
} from '@/lib/vocabulary';
import { Badge } from '@ohmypos/ui/components/badge';
import {
  DEFAULT_EXPENSES_PAGE_SIZE,
  fetchSupplierPurchasesPage,
  useSupplierPurchases,
} from '@/hooks/useExpenses';
import { fetchAllPages } from '@/lib/fetchAllPages';
import { DataTable, SortableHeader } from '@/components/ui/data-table';
import type { ExportColumn } from '@/lib/export';
import type {
  SortOrder,
  SupplierPurchaseResponse,
  SupplierPurchaseSortBy,
} from '@ohmypos/api-contracts';
import { PurchaseEntryFormDialog } from './PurchaseEntryFormDialog';
import { CentralBranchTag } from './CentralBranchTag';

interface PurchaseEntryTabProps {
  onGoToPayables: () => void;
}

const columns: ColumnDef<SupplierPurchaseResponse>[] = [
  {
    accessorFn: (row) => new Date(row.purchaseDate).getTime(),
    id: 'purchaseDate',
    header: ({ column }) => <SortableHeader label="Tanggal" column={column} />,
    cell: ({ row }) => (
      <span className="text-text-secondary">
        {new Date(row.original.purchaseDate).toLocaleDateString('id-ID')}
      </span>
    ),
  },
  {
    accessorKey: 'supplierName',
    header: 'Pemasok',
    cell: ({ row }) => (
      <span className="font-medium text-text-primary">
        {row.original.supplierName}
      </span>
    ),
  },
  {
    accessorFn: (row) => row.branchId ?? 'Central',
    id: 'branchId',
    header: 'Lokasi',
    cell: ({ row }) => <CentralBranchTag branchId={row.original.branchId} />,
  },
  {
    accessorKey: 'paymentStatus',
    filterFn: 'equalsString',
    header: 'Status',
    cell: ({ row }) => (
      <Badge
        className={`text-[11px] ${getPaymentStatusBadgeClasses(row.original.paymentStatus)}`}
      >
        {formatPaymentStatus(row.original.paymentStatus)}
      </Badge>
    ),
    meta: { align: 'center' },
  },
  {
    accessorFn: (row) => Number(row.totalAmount),
    id: 'totalAmount',
    header: ({ column }) => (
      <SortableHeader label="Total" column={column} align="right" />
    ),
    cell: ({ row }) => (
      <span className="numeric font-mono font-medium text-accent-outflow">
        {formatCurrency(row.original.totalAmount)}
      </span>
    ),
    meta: { align: 'right' },
  },
];

/**
 * The two column ids that exist as backend sort keys
 * (`SupplierPurchaseSortBySchema`). `supplierName`, `branchId` and
 * `paymentStatus` render plain headers: the server cannot order by them, and a
 * sortable header over one page reorders 10 rows while looking like it ordered
 * every purchase — same pattern as `StockMovementsTable`.
 */
const SORTABLE_COLUMN_IDS: SupplierPurchaseSortBy[] = [
  'purchaseDate',
  'totalAmount',
];

function toSupplierPurchaseSortBy(
  columnId: string | undefined,
): SupplierPurchaseSortBy {
  return SORTABLE_COLUMN_IDS.includes(columnId as SupplierPurchaseSortBy)
    ? (columnId as SupplierPurchaseSortBy)
    : 'purchaseDate';
}

const exportColumns: ExportColumn<SupplierPurchaseResponse>[] = [
  { header: 'Tanggal', accessor: (row) => new Date(row.purchaseDate) },
  { header: 'Pemasok', accessor: (row) => row.supplierName },
  { header: 'Lokasi', accessor: (row) => row.branchId ?? 'Umum' },
  {
    header: 'Status',
    accessor: (row) => formatPaymentStatus(row.paymentStatus),
  },
  { header: 'Total (IDR)', accessor: (row) => Number(row.totalAmount) },
];

export function PurchaseEntryTab({ onGoToPayables }: PurchaseEntryTabProps) {
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [unpaidBanner, setUnpaidBanner] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(DEFAULT_EXPENSES_PAGE_SIZE);
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'purchaseDate', desc: true },
  ]);

  // A sort change invalidates the current page number — page 2 of the old
  // ordering is not page 2 of the new one.
  const handleSortingChange: OnChangeFn<SortingState> = (updater) => {
    setSorting((current) =>
      typeof updater === 'function' ? updater(current) : updater,
    );
    setPage(1);
  };

  const activeSort = sorting[0];

  // One object for both the on-screen query and the Export loop, so the file
  // can never hold a different ordering or filter than the screen.
  const queryParams = React.useMemo(
    () => ({
      page,
      limit,
      sortBy: toSupplierPurchaseSortBy(activeSort?.id),
      sortOrder: (activeSort?.desc === false ? 'asc' : 'desc') as SortOrder,
    }),
    [page, limit, activeSort?.id, activeSort?.desc],
  );

  const { data, isLoading } = useSupplierPurchases(queryParams);
  const purchases = data?.data ?? [];
  const paginationMeta = data?.meta ?? { total: 0, page, limit, totalPages: 1 };

  const exportAll = React.useCallback(
    () =>
      fetchAllPages((exportPage, exportLimit) =>
        fetchSupplierPurchasesPage({
          ...queryParams,
          page: exportPage,
          limit: exportLimit,
        }),
      ),
    [queryParams],
  );

  const handleUnpaidPurchaseCreated = (supplierName: string) => {
    setUnpaidBanner(supplierName);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">
            Pembelian Bahan Baku
          </h2>
          <p className="text-xs text-text-secondary">
            Stok bertambah segera; pengeluaran hanya tercatat jika dibayar
            langsung.
          </p>
        </div>
        <Button
          onClick={() => setIsCreateOpen(true)}
          className="gap-2 shrink-0 w-full md:w-auto"
        >
          <Plus className="size-4" />
          Catat Pembelian
        </Button>
      </div>

      {unpaidBanner && (
        <div className="flex items-center justify-between gap-3 rounded-sm border border-status-warning/30 bg-status-warning/10 p-3 text-sm text-status-warning">
          <span>
            Pembelian dari <strong>{unpaidBanner}</strong> tercatat sebagai
            utang (belum dibayar).
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 shrink-0"
            onClick={() => {
              setUnpaidBanner(null);
              onGoToPayables();
            }}
          >
            Lihat di Utang
            <ArrowRight className="size-3.5" />
          </Button>
        </div>
      )}

      <DataTable
        columns={columns}
        data={purchases}
        isLoading={isLoading}
        sorting={sorting}
        onSortingChange={handleSortingChange}
        pagination={{
          meta: paginationMeta,
          onPageChange: setPage,
          onLimitChange: (next) => {
            setLimit(next);
            setPage(1);
          },
          itemNoun: 'pembelian',
        }}
        emptyMessage="Belum ada pembelian tercatat. Klik Tambah untuk mencatat belanja bahan ke pemasok."
        exportColumns={exportColumns}
        exportFilename={`pembelian-bahan-baku_${new Date().toISOString().slice(0, 10)}.xlsx`}
        exportAll={exportAll}
        exportTotal={paginationMeta.total}
      />

      <PurchaseEntryFormDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onUnpaidPurchaseCreated={handleUnpaidPurchaseCreated}
      />
    </div>
  );
}
