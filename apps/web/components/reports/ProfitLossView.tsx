'use client';

import * as React from 'react';
import { Download } from 'lucide-react';
import type { ProfitLossResponse } from '@ohmypos/api-contracts';
import { Button } from '@ohmypos/ui/components/button';
import { Card, CardContent } from '@ohmypos/ui/components/card';
import { Skeleton } from '@ohmypos/ui/components/skeleton';
import { exportRowsToXlsx, rangeSuffix, type ExportColumn } from '@/lib/export';
import type { ReportFilters } from '@/hooks/useReports';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { getFlowIndicatorClassesForAmount } from '@/lib/vocabulary';
import { ReportBarChart } from './ReportChart';

const exportColumns: ExportColumn<ProfitLossResponse>[] = [
  { header: 'Pendapatan (IDR)', accessor: (row) => Number(row.totalIncome) },
  { header: 'HPP (IDR)', accessor: (row) => Number(row.cogs) },
  {
    header: 'Beban Operasional (IDR)',
    accessor: (row) => Number(row.operatingExpenses),
  },
  { header: 'Laba Bersih (IDR)', accessor: (row) => Number(row.netProfit) },
  {
    header: 'Margin Bersih (%)',
    accessor: (row) => Number(row.netMarginPct ?? 0),
  },
  {
    header: 'Kas Masuk (IDR)',
    accessor: (row) => Number(row.cash.totalInflow),
  },
  {
    header: 'Kas Keluar (IDR)',
    accessor: (row) => Number(row.cash.totalOutflow),
  },
  {
    header: 'Kas Keluar Bahan Baku (IDR)',
    accessor: (row) => Number(row.cash.materialCashOutflow),
  },
  {
    header: 'Arus Kas Bersih (IDR)',
    accessor: (row) => Number(row.cash.netCashFlow),
  },
];

interface ProfitLossViewProps {
  data: ProfitLossResponse | undefined;
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

function KpiCard({
  label,
  value,
  valueClassName,
  helper,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  helper?: string;
}) {
  return (
    <Card className="p-4">
      <CardContent className="p-0">
        <p className="text-xs text-text-tertiary">{label}</p>
        <p
          className={`mt-1 text-xl font-bold font-mono ${valueClassName ?? 'text-text-primary'}`}
        >
          {value}
        </p>
        {helper && (
          <p className="mt-0.5 text-[11px] text-text-secondary">{helper}</p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Dashboard 3 — Profit & Loss (PRD §5.4, ADR-017). Two views live on this
 * response and neither is derived from the other: `netProfit` is the margin
 * view (income − COGS − operating expenses, excludes material purchases
 * because those are already inside COGS when sold); the `cash` block is what
 * actually moved through the bank/cash accounts. Both are rendered, labelled
 * separately, so an owner never has to guess which figure answers which
 * question.
 */
export function ProfitLossView({
  data,
  isLoading,
  filters,
}: ProfitLossViewProps) {
  const [isExporting, setIsExporting] = React.useState(false);

  const handleExport = React.useCallback(async () => {
    if (!data) return;
    setIsExporting(true);
    try {
      await exportRowsToXlsx(
        `laba-rugi_${rangeSuffix(filters.startDate, filters.endDate)}.xlsx`,
        exportColumns,
        [data],
      );
    } finally {
      setIsExporting(false);
    }
    // The range belongs in the deps: without it, changing the date range and
    // exporting writes the PREVIOUS range into the filename (DEBT-025 again,
    // one step further in).
  }, [data, filters.startDate, filters.endDate]);

  const chartData = React.useMemo(() => {
    if (!data) return [];
    return [
      { name: 'Pendapatan', value: Number(data.totalIncome) },
      { name: 'HPP', value: Number(data.cogs) },
      { name: 'Beban Operasional', value: Number(data.operatingExpenses) },
      { name: 'Laba Bersih', value: Number(data.netProfit) },
    ];
  }, [data]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <Skeleton className="h-[280px] w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="default"
          onClick={handleExport}
          disabled={!data || isExporting}
        >
          <Download className="size-4" />
          Export
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard
          label="Pendapatan"
          value={formatCurrency(data?.totalIncome)}
          valueClassName="text-accent-inflow"
        />
        <KpiCard label="HPP" value={formatCurrency(data?.cogs)} />
        <KpiCard
          label="Laba Bersih"
          value={formatCurrency(data?.netProfit)}
          valueClassName={getFlowIndicatorClassesForAmount(
            data?.netProfit ?? '0',
          )}
          helper={
            data?.netMarginPct !== undefined
              ? `margin ${formatPercent(data?.netMarginPct)}`
              : undefined
          }
        />
      </div>

      <ReportBarChart
        data={chartData}
        xKey="name"
        bars={[{ key: 'value', label: 'Jumlah' }]}
        tooltipFormatter={(v) => formatCurrency(v)}
      />

      <Card className="p-4">
        <CardContent className="p-0 space-y-3">
          <p className="text-sm font-semibold text-text-primary">
            Arus Kas Periode Ini
          </p>
          <p className="text-xs text-text-secondary">
            Berbeda dari laba bersih di atas: laba bersih tidak menghitung
            pembelian bahan baku yang belum terjual, arus kas menghitungnya
            (ADR-017).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <p className="text-xs text-text-tertiary">Kas Masuk</p>
              <p className="mt-0.5 font-mono text-sm text-accent-inflow">
                {formatCurrency(data?.cash.totalInflow)}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-tertiary">Kas Keluar</p>
              <p className="mt-0.5 font-mono text-sm text-accent-outflow">
                {formatCurrency(data?.cash.totalOutflow)}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-tertiary">
                Kas Keluar untuk Bahan Baku
              </p>
              <p className="mt-0.5 font-mono text-sm text-accent-outflow">
                {formatCurrency(data?.cash.materialCashOutflow)}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-tertiary">Arus Kas Bersih</p>
              <p
                className={`mt-0.5 font-mono text-sm ${getFlowIndicatorClassesForAmount(
                  data?.cash.netCashFlow ?? '0',
                )}`}
              >
                {formatCurrency(data?.cash.netCashFlow)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
