'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import type {
  DailyIncomeResponse,
  DailyIncomeRow,
} from '@ohmypos/api-contracts';
import { Card, CardContent } from '@ohmypos/ui/components/card';
import { Skeleton } from '@ohmypos/ui/components/skeleton';
import { DataTable, SortableHeader } from '@/components/ui/data-table';
import { rangeSuffix, type ExportColumn } from '@/lib/export';
import type { ReportFilters } from '@/hooks/useReports';
import { formatCurrency } from '@/lib/formatters';
import { getFlowIndicatorClasses } from '@/lib/vocabulary';
import { ChartEmptyState, ReportLineChart } from './ReportChart';

interface DailyIncomeViewProps {
  data: DailyIncomeResponse | undefined;
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

const columns: ColumnDef<DailyIncomeRow>[] = [
  {
    accessorKey: 'date',
    header: ({ column }) => <SortableHeader label="Tanggal" column={column} />,
    cell: ({ row }) => (
      <span className="font-mono text-text-primary">{row.original.date}</span>
    ),
  },
  {
    accessorFn: (row) => Number(row.income),
    id: 'income',
    header: ({ column }) => (
      <SortableHeader label="Pendapatan" column={column} align="right" />
    ),
    cell: ({ row }) => (
      <span
        className={`font-mono tabular-nums ${getFlowIndicatorClasses('INFLOW')}`}
      >
        {formatCurrency(row.original.income)}
      </span>
    ),
    meta: { align: 'right' },
  },
  {
    accessorFn: (row) => row.entryCount,
    id: 'entryCount',
    header: ({ column }) => (
      <SortableHeader label="Jumlah Transaksi" column={column} align="right" />
    ),
    cell: ({ row }) => (
      <span className="font-mono tabular-nums text-text-secondary">
        {row.original.entryCount}
      </span>
    ),
    meta: { align: 'right' },
  },
];

const exportColumns: ExportColumn<DailyIncomeRow>[] = [
  { header: 'Tanggal', accessor: (row) => new Date(row.date) },
  { header: 'Pendapatan (IDR)', accessor: (row) => Number(row.income) },
  { header: 'Jumlah Transaksi', accessor: (row) => row.entryCount },
];

/** Dashboard 3 — Total Daily Income (PRD §5.4). The one report with a real
 * per-day series, so it's the only view carrying the literal "trend line"
 * chart the PRD asks for; the other reports are period aggregates. */
export function DailyIncomeView({
  data,
  isLoading,
  filters,
}: DailyIncomeViewProps) {
  const chartData = React.useMemo(
    () =>
      (data?.rows ?? []).map((row) => ({
        date: row.date.slice(5),
        income: Number(row.income),
      })),
    [data],
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-[280px] w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const hasRows = (data?.rows.length ?? 0) > 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card className="p-4">
          <CardContent className="p-0">
            <p className="text-xs text-text-tertiary">
              Total Pendapatan Periode
            </p>
            <p
              className={`mt-1 text-xl font-bold font-mono ${getFlowIndicatorClasses('INFLOW')}`}
            >
              {formatCurrency(data?.total)}
            </p>
          </CardContent>
        </Card>
        <Card className="p-4">
          <CardContent className="p-0">
            <p className="text-xs text-text-tertiary">Rata-rata per Hari</p>
            <p className="mt-1 text-xl font-bold font-mono text-text-primary">
              {formatCurrency(data?.averagePerDay)}
            </p>
          </CardContent>
        </Card>
      </div>

      {hasRows ? (
        <ReportLineChart
          data={chartData}
          xKey="date"
          lines={[{ key: 'income', label: 'Pendapatan' }]}
          tooltipFormatter={(v) => formatCurrency(v)}
        />
      ) : (
        <ChartEmptyState message="Tidak ada pendapatan pada rentang ini." />
      )}

      <DataTable
        columns={columns}
        data={data?.rows ?? []}
        emptyMessage="Tidak ada data pendapatan harian"
        emptyDescription="Belum ada transaksi pada rentang tanggal ini."
        exportColumns={exportColumns}
        exportFilename={`pendapatan-harian_${rangeSuffix(filters.startDate, filters.endDate)}.xlsx`}
      />
    </div>
  );
}
