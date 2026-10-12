'use client';

import * as React from 'react';
import {
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  type OnChangeFn,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  Search,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Download,
  type LucideIcon,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ohmypos/ui/components/table';
import { Input } from '@ohmypos/ui/components/input';
import { Button } from '@ohmypos/ui/components/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ohmypos/ui/components/select';
import { Skeleton } from '@ohmypos/ui/components/skeleton';
import { cn } from '@ohmypos/ui/lib/utils';
import { exportRowsToXlsx, type ExportColumn } from '@/lib/export';
import { EXPORT_ROW_CAP, ExportTooLargeError } from '@/lib/fetchAllPages';
import { formatThousands } from '@/lib/formatters';

/** Server-side search over the whole result set. Supersedes `searchColumns`. */
export interface DataTableServerSearch {
  value: string;
  onChange: (value: string) => void;
}

interface DataTableToolbarProps<TData> {
  table: ReturnType<typeof useReactTable<TData>>;
  searchColumns?: string[];
  serverSearch?: DataTableServerSearch;
  searchPlaceholder?: string;
  searchLabel?: string;
}

function DataTableToolbar<TData>({
  table,
  searchColumns,
  serverSearch,
  searchPlaceholder = 'Cari...',
  searchLabel = 'Cari',
}: DataTableToolbarProps<TData>) {
  const columns = (searchColumns ?? [])
    .map((id) => table.getColumn(id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  if (!serverSearch && columns.length === 0) return null;

  const value = serverSearch
    ? serverSearch.value
    : ((columns[0]?.getFilterValue() as string) ?? '');

  return (
    // `w-full` so the placeholder is not truncated.
    <div className="relative w-full max-w-xs">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-text-tertiary" />
      <Input
        type="search"
        value={value}
        onChange={(event) => {
          const next = event.target.value;
          if (serverSearch) {
            serverSearch.onChange(next);
            return;
          }
          columns.forEach((column) => column.setFilterValue(next));
        }}
        placeholder={searchPlaceholder}
        aria-label={searchLabel}
        className="pl-8"
      />
    </div>
  );
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  isLoading?: boolean;
  searchColumns?: string[];
  /** See `DataTableServerSearch`. Supersedes `searchColumns` when both are set. */
  serverSearch?: DataTableServerSearch;
  searchPlaceholder?: string;
  searchLabel?: string;
  emptyMessage?: string;
  emptyDescription?: string;
  /** Plain-value columns for Export; requires `exportFilename`. */
  exportColumns?: ExportColumn<TData>[];
  exportFilename?: string;
  /**
   * Fetches every filtered row for Export. Required with `pagination` +
   * `exportColumns` (DEBT-048); omit for tables that already hold the full set.
   */
  exportAll?: () => Promise<TData[]>;
  /** Total rows behind the filter (`pagination.meta.total`), for the Export label. */
  exportTotal?: number;
  /** Pins the first column while scrolling horizontally (design.md §13.3). Default true. */
  stickyFirstColumn?: boolean;
  /** Server-driven sorting: pass both `sorting` and `onSortingChange`. */
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  /** Server-driven pagination: `data` holds one page. Use `serverSearch` for search. */
  pagination?: DataTablePagination;
}

function ExportButton<TData>({
  table,
  exportColumns,
  exportFilename,
  exportAll,
  exportTotal,
}: {
  table: ReturnType<typeof useReactTable<TData>>;
  exportColumns: ExportColumn<TData>[];
  exportFilename: string;
  exportAll?: () => Promise<TData[]>;
  exportTotal?: number;
}) {
  const [isExporting, setIsExporting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Under server pagination the filtered row model is only one page.
  const rowCount = exportTotal ?? table.getFilteredRowModel().rows.length;
  const isTooLarge = rowCount > EXPORT_ROW_CAP;

  const handleExport = React.useCallback(async () => {
    setIsExporting(true);
    setError(null);
    try {
      const rows = exportAll
        ? await exportAll()
        : table.getFilteredRowModel().rows.map((row) => row.original);
      await exportRowsToXlsx(exportFilename, exportColumns, rows);
    } catch (err) {
      // A failed export must be visible.
      setError(
        err instanceof ExportTooLargeError
          ? 'Terlalu banyak baris — persempit filter dulu.'
          : 'Ekspor belum selesai. Periksa koneksi lalu coba lagi.',
      );
    } finally {
      setIsExporting(false);
    }
  }, [table, exportColumns, exportFilename, exportAll]);

  return (
    <div className="flex items-center gap-2">
      {error && (
        <span role="alert" className="text-xs text-status-danger">
          {error}
        </span>
      )}
      <Button
        type="button"
        variant="outline"
        size="default"
        onClick={handleExport}
        disabled={rowCount === 0 || isExporting || isTooLarge}
        title={
          isTooLarge
            ? `Export dibatasi ${formatThousands(EXPORT_ROW_CAP)} baris. Persempit filter dulu.`
            : undefined
        }
        className="h-6"
      >
        <Download className="size-4" />
        {isExporting ? 'Menyiapkan…' : `Export (${formatThousands(rowCount)})`}
      </Button>
    </div>
  );
}

/** Rows-per-page selector in the toolbar; reads `meta.limit` (design.md §12.4). */
function PageSizeSelect({
  limit,
  onLimitChange,
}: {
  limit: number;
  onLimitChange: (limit: number) => void;
}) {
  return (
    <Select
      value={String(limit)}
      onValueChange={(value) => onLimitChange(Number(value))}
    >
      <SelectTrigger
        aria-label="Jumlah baris per halaman"
        data-testid="data-table-page-size"
        className="numeric h-6 w-auto min-w-14 gap-1.5 px-2 py-0 font-mono text-xs"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PAGE_SIZE_OPTIONS.map((size) => (
          <SelectItem
            key={size}
            value={String(size)}
            className="numeric font-mono text-xs"
          >
            {size}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Reads `meta.align` from a column definition; columns opt into alignment. */
function getColumnAlign(
  meta: ColumnDef<unknown, unknown>['meta'],
): string | undefined {
  const align = (meta as { align?: string } | undefined)?.align;
  if (align === 'right') return 'text-right';
  if (align === 'center') return 'text-center';
  return undefined;
}

/** Pinned first column with its own background and row-synced hover (design.md §12.1). */
function stickyCellClass(
  isFirst: boolean,
  isHeader: boolean,
): string | undefined {
  if (!isFirst) return undefined;
  return isHeader
    ? 'sticky left-0 z-20 bg-surface-muted'
    : 'sticky left-0 z-10 bg-surface-raised [tr:hover_&]:bg-surface-muted';
}

/** Server pagination state; `meta` is the shared `PaginationMeta`. */
export interface DataTablePagination {
  meta: { total: number; page: number; limit: number; totalPages: number };
  onPageChange: (page: number) => void;
  /** Renders the rows-per-page selector. The handler must also reset to page 1. */
  onLimitChange?: (limit: number) => void;
  /** Noun for the row count, e.g. "transaksi". Defaults to "baris". */
  itemNoun?: string;
}

/** Fixed options; the API caps `limit` at 100. */
export const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

/** Footer for server-paginated tables, always rendered (design.md §12.4). */
function DataTablePaginationFooter({
  meta,
  onPageChange,
  itemNoun = 'baris',
}: DataTablePagination) {
  const from = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1;
  const to = Math.min(meta.page * meta.limit, meta.total);

  return (
    <div
      className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border-default p-4"
      data-testid="data-table-pagination"
    >
      <span className="text-xs text-text-secondary">
        {meta.total === 0 ? (
          `Tidak ada ${itemNoun}`
        ) : (
          <>
            Menampilkan{' '}
            <span className="numeric font-mono text-text-primary">
              {from}&ndash;{to}
            </span>{' '}
            dari{' '}
            <span className="numeric font-mono text-text-primary">
              {meta.total}
            </span>{' '}
            {itemNoun}
          </>
        )}
      </span>

      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          size="default"
          className="h-6"
          variant="outline"
          aria-label="Halaman sebelumnya"
          disabled={meta.page <= 1}
          onClick={() => onPageChange(Math.max(1, meta.page - 1))}
        >
          <ChevronLeft className="size-4" />
        </Button>

        <span
          className="numeric font-mono px-2 text-xs text-text-tertiary"
          data-testid="data-table-page-indicator"
        >
          <span className="border-b border-border-gold pb-0.5 font-semibold text-text-primary">
            {meta.page}
          </span>
          {' / '}
          {meta.totalPages}
        </span>

        <Button
          type="button"
          size="default"
          className="h-6"
          variant="outline"
          aria-label="Halaman berikutnya"
          disabled={meta.page >= meta.totalPages}
          onClick={() => onPageChange(meta.page + 1)}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

/** Sortable column header; click toggles asc/desc (design.md §12.1). */
export function SortableHeader<TData>({
  label,
  column,
  align = 'left',
}: {
  label: string;
  column: Column<TData>;
  align?: 'left' | 'right';
}) {
  const sorted = column.getIsSorted();
  const Icon: LucideIcon | null =
    sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ArrowUpDown;

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={`-ml-2 h-8 px-2 font-semibold text-text-secondary text-xs uppercase tracking-wider ${align === 'right' ? 'ml-0 -mr-2' : ''}`}
      onClick={() => column.toggleSorting(sorted === 'asc')}
      aria-label={`Urutkan kolom ${label}`}
    >
      {label}
      <Icon className="size-3.5" />
    </Button>
  );
}

export function DataTable<TData, TValue>({
  columns,
  data,
  isLoading = false,
  searchColumns,
  serverSearch,
  searchPlaceholder,
  searchLabel,
  emptyMessage = 'Tidak ada data',
  emptyDescription,
  exportColumns,
  exportFilename,
  exportAll,
  exportTotal,
  stickyFirstColumn = true,
  sorting,
  onSortingChange,
  pagination,
}: DataTableProps<TData, TValue>) {
  const [internalSorting, setInternalSorting] = React.useState<SortingState>(
    [],
  );
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  );

  // Both halves of the controlled pair are required.
  const isManualSorting =
    sorting !== undefined && onSortingChange !== undefined;
  const activeSorting = isManualSorting ? sorting : internalSorting;

  // eslint-disable-next-line react-hooks/incompatible-library -- standard shadcn DataTable wrapper; useReactTable returns non-memoizable functions by design (TanStack Table)
  const table = useReactTable({
    data,
    columns,
    state: { sorting: activeSorting, columnFilters },
    onSortingChange: isManualSorting ? onSortingChange : setInternalSorting,
    onColumnFiltersChange: setColumnFilters,
    // Still wired: ignored under manualSorting, needed by client-sorted tables.
    manualSorting: isManualSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const rows = table.getRowModel().rows;
  const hasActiveFilters =
    Boolean(serverSearch?.value) ||
    columnFilters.some((f) => f.value !== '' && f.value !== undefined);
  const canExport = Boolean(exportColumns && exportFilename);
  const hasSearch =
    Boolean(serverSearch) || Boolean(searchColumns && searchColumns.length > 0);
  const hasPageSize = Boolean(pagination?.onLimitChange);

  return (
    <div className="rounded-md border border-border-default bg-surface-raised overflow-hidden">
      {(hasSearch || canExport || hasPageSize) && (
        <div className="p-4 border-b border-border-default flex flex-wrap items-center justify-between gap-3">
          {hasSearch ? (
            <DataTableToolbar
              table={table}
              searchColumns={searchColumns}
              serverSearch={serverSearch}
              searchPlaceholder={searchPlaceholder}
              searchLabel={searchLabel}
            />
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2">
            {hasPageSize && pagination?.onLimitChange && (
              <PageSizeSelect
                limit={pagination.meta.limit}
                onLimitChange={pagination.onLimitChange}
              />
            )}
            {canExport && exportColumns && exportFilename && (
              <ExportButton
                table={table}
                exportColumns={exportColumns}
                exportFilename={exportFilename}
                exportAll={exportAll}
                exportTotal={exportTotal}
              />
            )}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="p-4 space-y-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <div className="p-12 text-center">
          <h3 className="font-semibold text-base text-text-primary">
            {hasActiveFilters
              ? 'Tidak ditemukan data yang cocok dengan filter.'
              : emptyMessage}
          </h3>
          {!hasActiveFilters && emptyDescription && (
            <p className="text-sm text-text-secondary mt-1">
              {emptyDescription}
            </p>
          )}
        </div>
      ) : (
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    data-sticky={
                      stickyFirstColumn && header.index === 0
                        ? 'true'
                        : undefined
                    }
                    className={cn(
                      getColumnAlign(header.column.columnDef.meta),
                      stickyFirstColumn &&
                        stickyCellClass(header.index === 0, true),
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && 'selected'}
              >
                {row.getVisibleCells().map((cell, index) => (
                  <TableCell
                    key={cell.id}
                    data-sticky={
                      stickyFirstColumn && index === 0 ? 'true' : undefined
                    }
                    className={cn(
                      getColumnAlign(cell.column.columnDef.meta),
                      stickyFirstColumn && stickyCellClass(index === 0, false),
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {pagination && <DataTablePaginationFooter {...pagination} />}
    </div>
  );
}
