'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import type {
  ProductRankBy,
  TopProductsResponse,
} from '@ohmypos/api-contracts';
import { Skeleton } from '@ohmypos/ui/components/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ohmypos/ui/components/select';
import { Label } from '@ohmypos/ui/components/label';
import { DataTable, SortableHeader } from '@/components/ui/data-table';
import type { ExportColumn } from '@/lib/export';
import {
  formatCurrency,
  formatPercent,
  formatQuantity,
} from '@/lib/formatters';
import { getFlowIndicatorClassesForAmount } from '@/lib/vocabulary';
import { useTopProducts, type ReportFilters } from '@/hooks/useReports';
import { ChartEmptyState, ReportBarChart } from './ReportChart';

interface TopProductsViewProps {
  filters: ReportFilters;
  enabled: boolean;
}

type TopProductRow = TopProductsResponse['rows'][number];

const RANK_BY_OPTIONS: { value: ProductRankBy; label: string }[] = [
  { value: 'quantity', label: 'Jumlah Terjual' },
  { value: 'revenue', label: 'Pendapatan' },
  { value: 'profit', label: 'Laba Kotor' },
];

const columns: ColumnDef<TopProductRow>[] = [
  {
    accessorKey: 'rank',
    header: () => (
      <span className="text-xs font-semibold uppercase text-text-secondary">
        #
      </span>
    ),
    cell: ({ row }) => (
      <span className="font-mono text-text-tertiary">{row.original.rank}</span>
    ),
    meta: { align: 'center' },
  },
  {
    accessorKey: 'productName',
    header: ({ column }) => <SortableHeader label="Produk" column={column} />,
    cell: ({ row }) => (
      <span className="font-medium text-text-primary">
        {row.original.productName}
      </span>
    ),
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

const exportColumns: ExportColumn<TopProductRow>[] = [
  { header: '#', accessor: (row) => row.rank },
  { header: 'Produk', accessor: (row) => row.productName },
  { header: 'Terjual', accessor: (row) => Number(row.quantitySold) },
  { header: 'Pendapatan (IDR)', accessor: (row) => Number(row.revenue) },
  { header: 'Laba Kotor (IDR)', accessor: (row) => Number(row.grossProfit) },
  { header: 'Margin (%)', accessor: (row) => Number(row.marginPct ?? 0) },
];

const RANK_METRIC_KEY: Record<
  ProductRankBy,
  'quantitySold' | 'revenue' | 'grossProfit'
> = {
  quantity: 'quantitySold',
  revenue: 'revenue',
  profit: 'grossProfit',
};

/**
 * Dashboard 3 — Top 10 Best-Selling Products (PRD §5.4). The only report with
 * its own extra filter (rankBy/limit, Phase 7 §6.1 TopProductsQuerySchema) —
 * that's specific to this view, not the shared date/branch bar, so it owns
 * its own `useTopProducts` call rather than receiving data as a prop like the
 * other four views.
 */
export function TopProductsView({ filters, enabled }: TopProductsViewProps) {
  const [rankBy, setRankBy] = React.useState<ProductRankBy>('quantity');

  const { data, isLoading } = useTopProducts(
    { ...filters, rankBy, limit: 10 },
    enabled,
  );

  const metricKey = RANK_METRIC_KEY[rankBy];
  const chartData = React.useMemo(
    () =>
      (data?.rows ?? []).map((row) => ({
        productName: row.productName,
        value: Number(row[metricKey]),
      })),
    [data, metricKey],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Label htmlFor="top-products-rank-by" className="text-sm">
          Urutkan berdasarkan
        </Label>
        <Select
          value={rankBy}
          onValueChange={(value) => setRankBy(value as ProductRankBy)}
        >
          <SelectTrigger id="top-products-rank-by" className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANK_BY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-[280px] w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          {(data?.rows.length ?? 0) > 0 ? (
            <ReportBarChart
              data={chartData}
              xKey="productName"
              bars={[
                {
                  key: 'value',
                  label:
                    RANK_BY_OPTIONS.find((o) => o.value === rankBy)?.label ??
                    'Nilai',
                },
              ]}
              tickFormatter={
                rankBy === 'quantity' ? (v) => formatQuantity(v) : undefined
              }
              tooltipFormatter={
                rankBy === 'quantity'
                  ? (v) => formatQuantity(v)
                  : (v) => formatCurrency(v)
              }
            />
          ) : (
            <ChartEmptyState message="Tidak ada produk terjual pada rentang ini." />
          )}

          <DataTable
            columns={columns}
            data={data?.rows ?? []}
            emptyMessage="Tidak ada data produk terlaris"
            emptyDescription="Belum ada penjualan pada rentang tanggal ini."
            exportColumns={exportColumns}
            exportFilename={`produk-terlaris_${new Date().toISOString().slice(0, 10)}.xlsx`}
          />
        </>
      )}
    </div>
  );
}
