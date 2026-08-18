'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  useCashBalance,
  useDailyIncome,
  useProfitLoss,
} from '@/hooks/useReports';
import { useInventorySummary } from '@/hooks/useInventory';
import { usePayablesSummary } from '@/hooks/useExpenses';
import { DashboardKpiCards } from './DashboardKpiCards';
import {
  ChartEmptyState,
  ReportLineChart,
} from '@/components/reports/ReportChart';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@ohmypos/ui/components/card';
import { Skeleton } from '@ohmypos/ui/components/skeleton';
import { formatCurrency } from '@/lib/formatters';

function toDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getCurrentMonthString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function DashboardClient() {
  const today = React.useMemo(() => toDateString(new Date()), []);
  const monthStart = React.useMemo(() => {
    const d = new Date();
    return toDateString(new Date(d.getFullYear(), d.getMonth(), 1));
  }, []);
  const currentPeriod = React.useMemo(() => getCurrentMonthString(), []);
  const monthRange = React.useMemo(
    () => ({ startDate: monthStart, endDate: today }),
    [monthStart, today],
  );

  const { data: profitLoss, isLoading: isProfitLossLoading } =
    useProfitLoss(monthRange);
  const { data: cashBalance, isLoading: isCashBalanceLoading } =
    useCashBalance();
  const { data: dailyIncome, isLoading: isDailyIncomeLoading } =
    useDailyIncome(monthRange);
  const { data: inventorySummary, isLoading: isInventoryLoading } =
    useInventorySummary(currentPeriod);
  const { data: payablesSummary, isLoading: isPayablesLoading } =
    usePayablesSummary();

  const isKpiLoading =
    isProfitLossLoading ||
    isCashBalanceLoading ||
    isInventoryLoading ||
    isPayablesLoading;

  // NOTE: field is `data`, not `rows` — see §0.1.
  const lowStockRows = (inventorySummary?.data ?? []).filter(
    (row) => row.status !== 'OK',
  );
  const suppliersWithUtang = (payablesSummary ?? []).filter(
    (s) => s.openPayableCount > 0,
  );

  // Mirrors apps/web/components/reports/DailyIncomeView.tsx's chartData shape
  // — reusing the same ReportLineChart this repo already built for this exact
  // series, rather than a new bespoke chart component (see Context's
  // post-planning correction and §5).
  const dailyIncomeChartData = React.useMemo(
    () =>
      (dailyIncome?.rows ?? []).map((row) => ({
        date: row.date.slice(5),
        income: Number(row.income),
      })),
    [dailyIncome],
  );

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div>
        <h1 className="text-lg font-semibold text-text-primary">Dashboard</h1>
        <p className="text-sm text-text-secondary">
          {new Date().toLocaleDateString('id-ID', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      </div>

      {/* KPI Summary */}
      <DashboardKpiCards
        cashBalance={cashBalance}
        profitLoss={profitLoss}
        payablesSummary={payablesSummary}
        inventorySummary={inventorySummary}
        isLoading={isKpiLoading}
      />

      {/* Primary Sales Overview */}
      <Card className="p-4 shadow-1 bg-surface-raised border-border-default">
        <CardHeader className="px-0 pb-2">
          <CardTitle className="text-sm">Tren Pendapatan Harian</CardTitle>
          {dailyIncome && (
            <p className="text-xs text-text-secondary">
              Total: {formatCurrency(dailyIncome.total)} · Rata-rata harian:{' '}
              {formatCurrency(dailyIncome.averagePerDay)}
            </p>
          )}
        </CardHeader>
        <CardContent className="px-0">
          {isDailyIncomeLoading ? (
            <Skeleton className="h-[280px] w-full" />
          ) : dailyIncomeChartData.length > 0 ? (
            <ReportLineChart
              data={dailyIncomeChartData}
              xKey="date"
              yKey="income"
              label="Pendapatan"
              tooltipFormatter={(v) => formatCurrency(v)}
            />
          ) : (
            <ChartEmptyState message="Belum ada pendapatan pada bulan ini." />
          )}
        </CardContent>
      </Card>

      {/* Secondary Operational Panels */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card className="p-4 shadow-1 bg-surface-raised border-border-default">
          <CardContent className="p-0">
            <p className="text-xs text-text-tertiary">Transaksi Bulan Ini</p>
            <p className="mt-1 text-xl font-bold font-mono text-text-primary">
              {isProfitLossLoading ? '—' : (profitLoss?.saleCount ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card className="p-4 shadow-1 bg-surface-raised border-border-default">
          <CardContent className="p-0">
            <p className="text-xs text-text-tertiary mb-2">
              Utang Terbesar per Supplier
            </p>
            {isPayablesLoading ? (
              <p className="text-sm text-text-secondary">Memuat...</p>
            ) : suppliersWithUtang.length === 0 ? (
              <p className="text-sm text-text-secondary">
                Tidak ada utang supplier
              </p>
            ) : (
              <ul className="space-y-1">
                {suppliersWithUtang
                  .slice()
                  .sort(
                    (a, b) =>
                      Number(b.totalOutstanding) - Number(a.totalOutstanding),
                  )
                  .slice(0, 5)
                  .map((s) => (
                    <li
                      key={s.supplierId}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-text-primary">
                        {s.supplierName}
                      </span>
                      <span className="font-mono text-accent-outflow">
                        {formatCurrency(s.totalOutstanding)}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity / Action Required */}
      <Card className="p-4 shadow-1 bg-surface-raised border-border-default">
        <CardHeader className="px-0 pb-2">
          <CardTitle className="text-sm">Perlu Perhatian</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {lowStockRows.length === 0 && suppliersWithUtang.length === 0 ? (
            <p className="text-sm text-text-secondary">
              Tidak ada tindakan yang diperlukan saat ini.
            </p>
          ) : (
            <ul className="space-y-1 text-sm">
              {lowStockRows.length > 0 && (
                <li>
                  <Link
                    href="/inventory"
                    className="text-brand-primary hover:underline"
                  >
                    {lowStockRows.length} bahan baku stok rendah — lihat
                    inventaris
                  </Link>
                </li>
              )}
              {suppliersWithUtang.length > 0 && (
                <li>
                  <Link
                    href="/expenses"
                    className="text-brand-primary hover:underline"
                  >
                    {suppliersWithUtang.length} supplier punya utang — lihat
                    pengeluaran
                  </Link>
                </li>
              )}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
