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

/**
 * OhMyPos data table (shadcn pattern over @tanstack/react-table + @ohmypos/ui
 * table primitives — DESIGN.md §12.1 Data Table Rules, pagination in §12.4 Pagination).
 *
 * The shared surface for every table that needs search / filter / sort instead
 * of a hand-rolled input. Column-level behavior is declared in `ColumnDef`s;
 * this component owns the toolbar (search input bound to one or more
 * filterable columns), sorting state, loading skeleton, and empty states.
 *
 * Column conventions:
 * - `meta: { align: 'right' | 'center' }` — alignment for numeric/centered cells.
 * - `accessorFn: (row) => Number(row.x)` — numeric sorting; string accessorKeys
 *   sort lexically, which is wrong for quantities and money.
 * - `filterFn: 'includesString'` / `'equalsString'` — opt a column into the
 *   toolbar search or a filter dropdown.
 */
interface DataTableToolbarProps<TData> {
  table: ReturnType<typeof useReactTable<TData>>;
  searchColumns?: string[];
  searchPlaceholder?: string;
  searchLabel?: string;
}

function DataTableToolbar<TData>({
  table,
  searchColumns,
  searchPlaceholder = 'Cari...',
  searchLabel = 'Cari',
}: DataTableToolbarProps<TData>) {
  if (!searchColumns || searchColumns.length === 0) return null;

  const columns = searchColumns
    .map((id) => table.getColumn(id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));
  if (columns.length === 0) return null;

  const value = (columns[0]?.getFilterValue() as string) ?? '';

  return (
    // `w-full` so the wrapper actually claims its max-w-xs budget: as a bare
    // flex item it sized to content and clipped the placeholder at ~199px,
    // which truncated "Cari keterangan di halaman ini…" to "Cari keterangan di
    // ha…" — losing the exact words that make the page-scoped search honest.
    <div className="relative w-full max-w-xs">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-text-tertiary" />
      <Input
        type="search"
        value={value}
        onChange={(event) => {
          const next = event.target.value;
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
  searchPlaceholder?: string;
  searchLabel?: string;
  emptyMessage?: string;
  emptyDescription?: string;
  /** Raw-value column spec for the Export button — parallel to `columns` but
   * without JSX cells, since a spreadsheet needs plain string/number/Date
   * values. Only rendered when both this and `exportFilename` are set. */
  exportColumns?: ExportColumn<TData>[];
  exportFilename?: string;
  /**
   * DESIGN.md §13.3 Backoffice Behaviour by Breakpoint: the identifying column stays pinned while the table
   * scrolls horizontally. On by default — it is a general backoffice rule, not
   * a per-table choice. Pass `false` for a table whose first column is not the
   * identifier (none today).
   */
  stickyFirstColumn?: boolean;
  /**
   * Server-driven sorting. Supply BOTH `sorting` and `onSortingChange` to hand
   * ordering to the backend — the table then stops reordering rows itself
   * (`manualSorting: true`), because with only one page in `data` a client-side
   * sort would silently reorder the page while claiming to sort the whole set.
   * Omit both and the table keeps its own sorting state, as every other table
   * in the app does.
   */
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  /**
   * Server-driven pagination. When supplied, `data` is expected to hold exactly
   * one page and the footer renders page controls — always, even for a single
   * page. Note that `searchColumns` filtering stays client-side and therefore
   * only searches the current page — label it accordingly at the call site.
   */
  pagination?: DataTablePagination;
}

function ExportButton<TData>({
  table,
  exportColumns,
  exportFilename,
}: {
  table: ReturnType<typeof useReactTable<TData>>;
  exportColumns: ExportColumn<TData>[];
  exportFilename: string;
}) {
  const [isExporting, setIsExporting] = React.useState(false);
  const rowCount = table.getFilteredRowModel().rows.length;

  const handleExport = React.useCallback(async () => {
    setIsExporting(true);
    try {
      const rows = table.getFilteredRowModel().rows.map((row) => row.original);
      await exportRowsToXlsx(exportFilename, exportColumns, rows);
    } finally {
      setIsExporting(false);
    }
  }, [table, exportColumns, exportFilename]);

  return (
    <Button
      type="button"
      variant="outline"
      size="default"
      onClick={handleExport}
      disabled={rowCount === 0 || isExporting}
      className="h-6"
    >
      <Download className="size-4" />
      Export
    </Button>
  );
}

/**
 * Rows-per-page selector (DESIGN.md §12.4 Pagination). Lives in the table's toolbar row,
 * aligned with the Export button, rather than in the footer — both are controls
 * over the whole table rather than over the current page.
 *
 * Reads its value from the server's `meta.limit`, never from a second copy of
 * the state, so it cannot disagree with the rows on screen. Height matches
 * ExportButton's so the toolbar row stays on one baseline.
 */
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

/**
 * The pinned first column (DESIGN.md §12.1 Data Table Rules, "Sticky Column"). A sticky cell
 * needs its own opaque
 * background or the scrolled content shows through it, and it needs to track
 * the row's hover state or the pinned cell visibly desyncs from its row — hence
 * the `[tr:hover_&]` arbitrary variant rather than inheriting `hover:` from the
 * row. The right-edge shadow only appears once the container is actually
 * scrolled, via `left-0` against the container's own scroll position.
 */
function stickyCellClass(
  isFirst: boolean,
  isHeader: boolean,
): string | undefined {
  if (!isFirst) return undefined;
  return isHeader
    ? 'sticky left-0 z-20 bg-surface-muted'
    : 'sticky left-0 z-10 bg-surface-raised [tr:hover_&]:bg-surface-muted';
}

/**
 * Server-driven pagination for a table whose rows come one page at a time.
 * `meta` is the `PaginationMeta` shape every paginated OhMyPos endpoint returns.
 */
export interface DataTablePagination {
  meta: { total: number; page: number; limit: number; totalPages: number };
  onPageChange: (page: number) => void;
  /**
   * Supply to render the rows-per-page selector. The handler MUST also reset to
   * page 1 — page 5 of a 10-row paging is not page 5 of a 50-row one, and
   * keeping the old number can land the operator past the end of the result.
   */
  onLimitChange?: (limit: number) => void;
  /** Noun for the row count, e.g. "transaksi". Defaults to "baris". */
  itemNoun?: string;
}

/** DESIGN.md §12.4 Pagination. Kept small and fixed — a free-text row count invites
 * values the API rejects (`PaginationQuerySchema` caps `limit` at 100). */
export const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

/**
 * Footer for server-paginated tables (DESIGN.md §12.4 Pagination).
 *
 * Always rendered, including for a single-page result: an invisible control is
 * indistinguishable from a missing one, so hiding it made the pagination
 * impossible to verify by looking at the screen.
 *
 * The caption states the row RANGE, not just the total — "uncompromising
 * financial precision" (§2) means an operator should be able to say exactly
 * which rows they are looking at. Every numeral is JetBrains Mono with
 * `tabular-nums` (§5, §10.1), so the digits do not shift width as pages change.
 *
 * The current page carries a champagne-gold hairline underline rather than gold
 * TEXT: `#C5A880` measures 2.26:1 against porcelain, far below the 4.5:1 that
 * §12 requires of text, so the gold lives in a non-text accent while the
 * numeral itself stays at full contrast.
 *
 * The rows-per-page control is NOT here — it sits in the toolbar row beside
 * Export (`PageSizeSelect`), because it governs the whole table rather than the
 * page currently shown.
 */
function DataTablePaginationFooter({
  meta,
  onPageChange,
  itemNoun = 'baris',
}: DataTablePagination) {
  const from = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1;
  const to = Math.min(meta.page * meta.limit, meta.total);

  return (
    <div
      className="flex items-center justify-between gap-3 border-t border-border-default p-4"
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

/** Sortable column header (DESIGN.md §12.1 Data Table Rules) — click toggles asc/desc. */
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
  searchPlaceholder,
  searchLabel,
  emptyMessage = 'Tidak ada data',
  emptyDescription,
  exportColumns,
  exportFilename,
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

  // Both halves of the controlled pair must be present; one alone would leave a
  // sort the table can display but nobody can change.
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
    // `getSortedRowModel` stays wired below: TanStack ignores it while
    // manualSorting is true, and the 15 tables that omit these props still need it.
    manualSorting: isManualSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const rows = table.getRowModel().rows;
  const hasActiveFilters = columnFilters.some(
    (f) => f.value !== '' && f.value !== undefined,
  );
  const canExport = Boolean(exportColumns && exportFilename);
  const hasSearch = Boolean(searchColumns && searchColumns.length > 0);
  const hasPageSize = Boolean(pagination?.onLimitChange);

  return (
    <div className="rounded-md border border-border-default bg-surface-raised overflow-hidden">
      {(hasSearch || canExport || hasPageSize) && (
        <div className="p-4 border-b border-border-default flex items-center justify-between gap-3">
          {hasSearch ? (
            <DataTableToolbar
              table={table}
              searchColumns={searchColumns}
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
