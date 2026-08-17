'use client';

import * as React from 'react';
import {
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
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
import { Skeleton } from '@ohmypos/ui/components/skeleton';

/**
 * OhMyPos data table (shadcn pattern over @tanstack/react-table + @ohmypos/ui
 * table primitives — DESIGN.md §28).
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
    <div className="relative max-w-xs">
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

/** Sortable column header (DESIGN.md §28) — click toggles asc/desc. */
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
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  );

  // eslint-disable-next-line react-hooks/incompatible-library -- standard shadcn DataTable wrapper; useReactTable returns non-memoizable functions by design (TanStack Table)
  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const rows = table.getRowModel().rows;
  const hasActiveFilters = columnFilters.some(
    (f) => f.value !== '' && f.value !== undefined,
  );

  return (
    <div className="rounded-md border border-border-default bg-surface-raised overflow-hidden">
      {searchColumns && searchColumns.length > 0 && (
        <div className="p-4 border-b border-border-default">
          <DataTableToolbar
            table={table}
            searchColumns={searchColumns}
            searchPlaceholder={searchPlaceholder}
            searchLabel={searchLabel}
          />
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
                    className={getColumnAlign(header.column.columnDef.meta)}
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
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={getColumnAlign(cell.column.columnDef.meta)}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
