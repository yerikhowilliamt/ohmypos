'use client';

import * as React from 'react';
import type {
  ColumnDef,
  OnChangeFn,
  SortingState,
} from '@tanstack/react-table';
import { Button } from '@ohmypos/ui/components/button';
import { Badge } from '@ohmypos/ui/components/badge';
import { Edit2, Plus } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import { formatLedgerSourceType } from '@/lib/vocabulary';
import {
  DEFAULT_EXPENSES_PAGE_SIZE,
  fetchLedgerEntriesPage,
  useBranches,
  useLedgerEntries,
} from '@/hooks/useExpenses';
import { fetchAllPages } from '@/lib/fetchAllPages';
import { DataTable, SortableHeader } from '@/components/ui/data-table';
import type { ExportColumn } from '@/lib/export';
import type {
  LedgerEntryResponse,
  LedgerEntrySortBy,
  SortOrder,
} from '@ohmypos/api-contracts';
import { GeneralExpenseFormDialog } from './GeneralExpenseFormDialog';

function buildColumns(
  branchNameById: ReadonlyMap<string, string>,
  onEdit: (entry: LedgerEntryResponse) => void,
): ColumnDef<LedgerEntryResponse>[] {
  return [
    {
      accessorKey: 'branchId',
      header: 'Lokasi',
      cell: ({ row }) => {
        const name = branchNameById.get(row.original.branchId);
        return (
          <span className="text-text-secondary">
            {name === 'Pusat (Dapur Sentral)' ? 'Pusat' : (name ?? '—')}
          </span>
        );
      },
    },
    {
      accessorFn: (row) => new Date(row.entryDate).getTime(),
      id: 'entryDate',
      header: ({ column }) => (
        <SortableHeader label="Tanggal" column={column} />
      ),
      cell: ({ row }) => (
        <span className="text-text-secondary">
          {new Date(row.original.entryDate).toLocaleDateString('id-ID')}
        </span>
      ),
    },
    {
      accessorKey: 'note',
      header: 'Catatan',
      cell: ({ row }) => (
        <span className="text-text-primary">
          {row.original.note ?? <span className="text-text-tertiary">—</span>}
        </span>
      ),
    },
    {
      accessorKey: 'sourceType',
      filterFn: 'includesString',
      header: 'Sumber',
      cell: ({ row }) => (
        <Badge
          variant={
            row.original.sourceType === 'MANUAL' ? 'outline' : 'secondary'
          }
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
    {
      header: 'Aksi',
      meta: { align: 'center' },
      cell: ({ row }) =>
        row.original.sourceType === 'MANUAL' ? (
          <Button
            variant="ghost"
            size="icon-xs"
            title="Edit pengeluaran"
            onClick={() => onEdit(row.original)}
          >
            <Edit2 data-icon="icon" />
            <span className="sr-only">Edit pengeluaran</span>
          </Button>
        ) : (
          <span className="text-xs text-text-tertiary">Otomatis</span>
        ),
    },
  ];
}

/**
 * The two column ids that exist as backend sort keys (`LedgerEntrySortBySchema`).
 * `note` and `sourceType` deliberately render a plain header instead of a
 * `SortableHeader`: with one page in `data`, a sortable header the server
 * cannot honour would reorder 10 rows while looking like it ordered the whole
 * ledger — same pattern as `StockMovementsTable`.
 */
const SORTABLE_COLUMN_IDS: LedgerEntrySortBy[] = ['entryDate', 'amount'];

function toLedgerEntrySortBy(columnId: string | undefined): LedgerEntrySortBy {
  return SORTABLE_COLUMN_IDS.includes(columnId as LedgerEntrySortBy)
    ? (columnId as LedgerEntrySortBy)
    : 'entryDate';
}

export function GeneralExpenseTab() {
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [editingEntry, setEditingEntry] =
    React.useState<LedgerEntryResponse | null>(null);
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(DEFAULT_EXPENSES_PAGE_SIZE);
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'entryDate', desc: true },
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
      sortBy: toLedgerEntrySortBy(activeSort?.id),
      sortOrder: (activeSort?.desc === false ? 'asc' : 'desc') as SortOrder,
    }),
    [page, limit, activeSort?.id, activeSort?.desc],
  );

  const { data, isLoading } = useLedgerEntries(queryParams);
  const { data: branches = [] } = useBranches();
  const entries = data?.data ?? [];
  const paginationMeta = data?.meta ?? { total: 0, page, limit, totalPages: 1 };
  const branchNameById = React.useMemo(
    () => new Map(branches.map((branch) => [branch.id, branch.name])),
    [branches],
  );
  const columns = React.useMemo(
    () => buildColumns(branchNameById, setEditingEntry),
    [branchNameById],
  );
  const exportColumns = React.useMemo<ExportColumn<LedgerEntryResponse>[]>(
    () => [
      { header: 'Tanggal', accessor: (row) => new Date(row.entryDate) },
      { header: 'Catatan', accessor: (row) => row.note ?? '' },
      {
        header: 'Lokasi',
        accessor: (row) => {
          const name = branchNameById.get(row.branchId);
          return name === 'Pusat (Dapur Sentral)' ? 'Pusat' : (name ?? '');
        },
      },
      {
        header: 'Sumber',
        accessor: (row) => formatLedgerSourceType(row.sourceType),
      },
      { header: 'Jumlah (IDR)', accessor: (row) => Number(row.amount) },
    ],
    [branchNameById],
  );

  const exportAll = React.useCallback(
    () =>
      fetchAllPages((exportPage, exportLimit) =>
        fetchLedgerEntriesPage({
          ...queryParams,
          page: exportPage,
          limit: exportLimit,
        }),
      ),
    [queryParams],
  );

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
        sorting={sorting}
        onSortingChange={handleSortingChange}
        pagination={{
          meta: paginationMeta,
          onPageChange: setPage,
          onLimitChange: (next) => {
            setLimit(next);
            setPage(1);
          },
          itemNoun: 'pengeluaran',
        }}
        emptyMessage="Belum ada pengeluaran tercatat."
        exportColumns={exportColumns}
        exportFilename={`pengeluaran-umum_${new Date().toISOString().slice(0, 10)}.xlsx`}
        exportAll={exportAll}
        exportTotal={paginationMeta.total}
      />

      <GeneralExpenseFormDialog
        open={isCreateOpen || Boolean(editingEntry)}
        onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) setEditingEntry(null);
        }}
        entry={editingEntry}
      />
    </div>
  );
}
