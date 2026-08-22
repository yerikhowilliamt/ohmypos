'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import type {
  ProductProfitResponse,
  ProductProfitRow,
} from '@ohmypos/api-contracts';
import { Card, CardContent } from '@ohmypos/ui/components/card';
import { Skeleton } from '@ohmypos/ui/components/skeleton';
import { DataTable, SortableHeader } from '@/components/ui/data-table';
import { rangeSuffix, type ExportColumn } from '@/lib/export';
import type { ReportFilters } from '@/hooks/useReports';
import {
  formatCurrency,
  formatPercent,
  formatQuantity,
} from '@/lib/formatters';
import { getFlowIndicatorClassesForAmount } from '@/lib/vocabulary';
import { ChartEmptyState, ReportBarChart } from './ReportChart';

interface ProductProfitViewProps {
  data: ProductProfitResponse | undefined;
  isLoading: boolean;
  /**
   * The report's own date range, for the export filename (DEBT-025). Without
   * it the file is named for the day it was exported, so two exports of
   * different ranges on the same day overwrite each other in Downloads — and
   * whoever opens the file later has no on-screen context to tell them which
   * period it covers.
   */
  filters: ReportFilters;
}

/** Chart stays legible with many SKUs in the table — top 10 by revenue only. */
const CHART_ROW_LIMIT = 10;

const columns: ColumnDef<ProductProfitRow>[] = [
  {
    accessorKey: 'productName',
    header: ({ column }) => <SortableHeader label="Produk" column={column} />,
    cell: ({ row }) => (
      <span className="font-medium text-text-primary">
        {row.original.productName}
      </span>
    ),
    filterFn: 'includesString',
  },
  {
    accessorFn: (row) => Number(row.quantitySold),
    id: 'quantitySold',
    header: ({ column }) => (
      <SortableHeader label="Terjual" column={column} align="right" />
    ),
    cell: ({ row }) => (
      <span className="font-mono tabular-nums text-text-secondary">
        {formatQuantity(row.original.quantitySold)}
      </span>
    ),
    meta: { align: 'right' },
  },
  {
    accessorFn: (row) => Number(row.revenue),
    id: 'revenue',
    header: ({ column }) => (
      <SortableHeader label="Pendapatan" column={column} align="right" />
    ),
    cell: ({ row }) => (
      <span className="font-mono tabular-nums text-text-primary">
        {formatCurrency(row.original.revenue)}
      </span>
    ),
    meta: { align: 'right' },
  },
  {
    accessorFn: (row) => Number(row.cogs),
    id: 'cogs',
    header: ({ column }) => (
      <SortableHeader label="HPP" column={column} align="right" />
    ),
    cell: ({ row }) => (
      <span className="font-mono tabular-nums text-text-secondary">
        {formatCurrency(row.original.cogs)}
      </span>
    ),
    meta: { align: 'right' },
  },
  {
    accessorFn: (row) => Number(row.grossProfit),
    id: 'grossProfit',
    header: ({ column }) => (
      <SortableHeader label="Laba Kotor" column={column} align="right" />
    ),
    cell: ({ row }) => (
      <span
        className={`font-mono tabular-nums ${getFlowIndicatorClassesForAmount(row.original.grossProfit)}`}
      >
        {formatCurrency(row.original.grossProfit)}
      </span>
    ),
    meta: { align: 'right' },
  },
  {
    accessorFn: (row) => Number(row.marginPct ?? 0),
    id: 'marginPct',
    header: ({ column }) => (
      <SortableHeader label="Margin" column={column} align="right" />
    ),
    cell: ({ row }) => (
      <span className="font-mono tabular-nums text-text-secondary">
        {formatPercent(row.original.marginPct)}
      </span>
    ),
    meta: { align: 'right' },
  },
];

const exportColumns: ExportColumn<ProductProfitRow>[] = [
  { header: 'Produk', accessor: (row) => row.productName },
  { header: 'Terjual', accessor: (row) => Number(row.quantitySold) },
  { header: 'Pendapatan (IDR)', accessor: (row) => Number(row.revenue) },
  { header: 'HPP (IDR)', accessor: (row) => Number(row.cogs) },
  { header: 'Laba Kotor (IDR)', accessor: (row) => Number(row.grossProfit) },
  { header: 'Margin (%)', accessor: (row) => Number(row.marginPct ?? 0) },
];

/** Dashboard 3 — Sales-per-Product Profit (PRD §5.4). */
export function ProductProfitView({
  data,
  isLoading,
  filters,
}: ProductProfitViewProps) {
  const chartData = React.useMemo(() => {
    if (!data) return [];
    return [...data.rows]
      .sort((a, b) => Number(b.revenue) - Number(a.revenue))
      .slice(0, CHART_ROW_LIMIT)
      .map((row) => ({
        productName: row.productName,
        revenue: Number(row.revenue),
        cogs: Number(row.cogs),
      }));
  }, [data]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-[280px] w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const hasRows = (data?.rows.length ?? 0) > 0;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <CardContent className="p-0 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <p className="text-xs text-text-tertiary">Total Pendapatan</p>
            <p className="mt-0.5 font-mono text-lg font-semibold text-text-primary">
              {formatCurrency(data?.totals.revenue)}
            </p>
          </div>
          <div>
            <p className="text-xs text-text-tertiary">Total HPP</p>
            <p className="mt-0.5 font-mono text-lg font-semibold text-text-primary">
              {formatCurrency(data?.totals.cogs)}
            </p>
          </div>
          <div>
            <p className="text-xs text-text-tertiary">Total Laba Kotor</p>
            <p
              className={`mt-0.5 font-mono text-lg font-semibold ${getFlowIndicatorClassesForAmount(
                data?.totals.grossProfit ?? '0',
              )}`}
            >
              {formatCurrency(data?.totals.grossProfit)}
            </p>
          </div>
        </CardContent>
      </Card>

      {hasRows ? (
        <ReportBarChart
          data={chartData}
          xKey="productName"
          bars={[
            {
              key: 'revenue',
              label: 'Pendapatan',
              color: 'var(--color-brand-primary)',
            },
            { key: 'cogs', label: 'HPP', color: 'var(--color-accent-outflow)' },
          ]}
          tooltipFormatter={(v) => formatCurrency(v)}
        />
      ) : (
        <ChartEmptyState message="Tidak ada penjualan produk pada rentang ini." />
      )}

      <DataTable
        columns={columns}
        data={data?.rows ?? []}
        searchColumns={['productName']}
        searchPlaceholder="Cari produk..."
        searchLabel="Cari produk"
        emptyMessage="Tidak ada data laba produk"
        emptyDescription="Belum ada penjualan pada rentang tanggal ini."
        exportColumns={exportColumns}
        exportFilename={`laba-per-produk_${rangeSuffix(filters.startDate, filters.endDate)}.xlsx`}
      />
    </div>
  );
}
