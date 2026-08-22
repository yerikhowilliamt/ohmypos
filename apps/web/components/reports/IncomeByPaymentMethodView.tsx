'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import type {
  IncomeByPaymentMethodResponse,
  IncomeByPaymentMethodRow,
} from '@ohmypos/api-contracts';
import { Skeleton } from '@ohmypos/ui/components/skeleton';
import { DataTable, SortableHeader } from '@/components/ui/data-table';
import { rangeSuffix, type ExportColumn } from '@/lib/export';
import type { ReportFilters } from '@/hooks/useReports';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { formatAccountType, getFlowIndicatorClasses } from '@/lib/vocabulary';
import { ChartEmptyState, ReportBarChart } from './ReportChart';

interface IncomeByPaymentMethodViewProps {
  data: IncomeByPaymentMethodResponse | undefined;
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

const columns: ColumnDef<IncomeByPaymentMethodRow>[] = [
  {
    accessorKey: 'accountName',
    header: ({ column }) => <SortableHeader label="Akun" column={column} />,
    cell: ({ row }) => (
      <div>
        <div className="font-medium text-text-primary">
          {row.original.accountName}
        </div>
        <div className="text-xs text-text-tertiary">
          {formatAccountType(row.original.accountType)}
        </div>
      </div>
    ),
    filterFn: 'includesString',
  },
  {
    accessorFn: (row) => Number(row.total),
    id: 'total',
    header: ({ column }) => (
      <SortableHeader label="Total" column={column} align="right" />
    ),
    cell: ({ row }) => (
      <span
        className={`font-mono tabular-nums ${getFlowIndicatorClasses('INFLOW')}`}
      >
        {formatCurrency(row.original.total)}
      </span>
    ),
    meta: { align: 'right' },
  },
  {
    accessorFn: (row) => Number(row.sharePct ?? 0),
    id: 'sharePct',
    header: ({ column }) => (
      <SortableHeader label="Kontribusi" column={column} align="right" />
    ),
    cell: ({ row }) => (
      <span className="font-mono tabular-nums text-text-secondary">
        {formatPercent(row.original.sharePct)}
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

const exportColumns: ExportColumn<IncomeByPaymentMethodRow>[] = [
  { header: 'Akun', accessor: (row) => row.accountName },
  {
    header: 'Tipe Akun',
    accessor: (row) => formatAccountType(row.accountType),
  },
  { header: 'Total (IDR)', accessor: (row) => Number(row.total) },
  { header: 'Kontribusi (%)', accessor: (row) => Number(row.sharePct ?? 0) },
  { header: 'Jumlah Transaksi', accessor: (row) => row.entryCount },
];

/** Dashboard 3 — Income by Payment Method (PRD §5.4). `total` here equals
 * ProfitLossResponse.totalIncome for the same range — a tested invariant on
 * the backend (Phase 7 §6.1); this view doesn't re-derive it. */
export function IncomeByPaymentMethodView({
  data,
  isLoading,
  filters,
}: IncomeByPaymentMethodViewProps) {
  const chartData = React.useMemo(
    () =>
      (data?.rows ?? []).map((row) => ({
        accountName: row.accountName,
        total: Number(row.total),
      })),
    [data],
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[280px] w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const hasRows = (data?.rows.length ?? 0) > 0;

  return (
    <div className="space-y-4">
      {hasRows ? (
        <ReportBarChart
          data={chartData}
          xKey="accountName"
          bars={[
            {
              key: 'total',
              label: 'Total',
              color: 'var(--color-accent-inflow)',
            },
          ]}
          tooltipFormatter={(v) => formatCurrency(v)}
        />
      ) : (
        <ChartEmptyState message="Tidak ada pendapatan pada rentang ini." />
      )}

      <DataTable
        columns={columns}
        data={data?.rows ?? []}
        searchColumns={['accountName']}
        searchPlaceholder="Cari akun..."
        searchLabel="Cari akun"
        emptyMessage="Tidak ada data pendapatan"
        emptyDescription="Belum ada transaksi pada rentang tanggal ini."
        exportColumns={exportColumns}
        exportFilename={`pendapatan-per-metode-bayar_${rangeSuffix(filters.startDate, filters.endDate)}.xlsx`}
      />
    </div>
  );
}
