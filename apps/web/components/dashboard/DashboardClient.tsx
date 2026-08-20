'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  useCashBalance,
  useDailyIncome,
  useIncomeByPaymentMethod,
  useProfitLoss,
  useTopProducts,
} from '@/hooks/useReports';
import { useInventorySummary } from '@/hooks/useInventory';
import { usePayablesSummary } from '@/hooks/useExpenses';
import { useSales } from '@/hooks/usePos';
import { DashboardKpiCards } from './DashboardKpiCards';
import { BranchProfitabilityCard } from './BranchProfitabilityCard';
import {
  ChartEmptyState,
  CHART_COLORS,
  ReportLineChart,
  ReportPieChart,
} from '@/components/reports/ReportChart';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@ohmypos/ui/components/card';
import { Skeleton } from '@ohmypos/ui/components/skeleton';
import { Badge } from '@ohmypos/ui/components/badge';
import { formatCurrency } from '@/lib/formatters';
import {
  AlertTriangle,
  ArrowRight,
  CreditCard,
  Package,
  ShoppingBag,
  TrendingUp,
  Wallet,
} from 'lucide-react';

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
  const { data: incomeByPayment, isLoading: isPaymentMethodsLoading } =
    useIncomeByPaymentMethod(monthRange);
  const { data: topProductsData, isLoading: isTopProductsLoading } =
    useTopProducts({ ...monthRange, limit: 5, rankBy: 'quantity' });
  const { data: recentSalesData, isLoading: isRecentSalesLoading } = useSales({
    limit: 5,
    sortBy: 'soldAt',
    sortOrder: 'desc',
  });
  const { data: inventorySummary, isLoading: isInventoryLoading } =
    useInventorySummary(currentPeriod);
  const { data: payablesSummary, isLoading: isPayablesLoading } =
    usePayablesSummary();

  const isKpiLoading =
    isProfitLossLoading ||
    isCashBalanceLoading ||
    isInventoryLoading ||
    isPayablesLoading;

  const lowStockRows = (inventorySummary?.data ?? []).filter(
    (row) => row.status !== 'OK',
  );
  const suppliersWithUtang = (payablesSummary ?? []).filter(
    (s) => s.openPayableCount > 0,
  );

  const dailyIncomeChartData = React.useMemo(
    () =>
      (dailyIncome?.rows ?? []).map((row) => ({
        date: row.date.slice(5),
        income: Number(row.income),
      })),
    [dailyIncome],
  );

  const paymentMethodsPieData = React.useMemo(() => {
    const rows = incomeByPayment?.rows ?? [];
    return rows.map((r, i) => ({
      name: r.accountName,
      value: Number(r.total),
      percentage: Number(r.sharePct ?? 0),
      color: CHART_COLORS[i % CHART_COLORS.length],
    }));
  }, [incomeByPayment]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            Dashboard
          </h1>
          <p className="text-sm text-text-secondary">
            Ringkasan performa finansial, penjualan, dan operasional bisnis.
          </p>
        </div>
        <div className="text-xs font-medium text-text-tertiary bg-surface-muted px-3 py-1.5 rounded-md border border-border-default self-start sm:self-auto">
          {new Date().toLocaleDateString('id-ID', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </div>
      </div>

      {/* KPI Summary Cards */}
      <DashboardKpiCards
        cashBalance={cashBalance}
        profitLoss={profitLoss}
        payablesSummary={payablesSummary}
        inventorySummary={inventorySummary}
        isLoading={isKpiLoading}
      />

      {/* Branch Profitability Breakdown */}
      <BranchProfitabilityCard range={monthRange} />

      {/* Primary Analytics Grid: Trend Line & Payment Methods Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Trend Pendapatan Harian */}
        <Card className="p-4 shadow-1 bg-surface-raised border-border-default lg:col-span-2 flex flex-col justify-between">
          <div>
            <CardHeader className="px-0 pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold text-text-primary">
                  Tren Pendapatan Harian
                </CardTitle>
                <Link
                  href="/reports/daily"
                  className="text-xs text-brand-primary hover:underline inline-flex items-center gap-1"
                >
                  Detail <ArrowRight className="size-3" />
                </Link>
              </div>
              {dailyIncome && (
                <p className="text-xs text-text-secondary">
                  Total bulan ini:{' '}
                  <span className="font-semibold font-mono text-text-primary">
                    {formatCurrency(dailyIncome.total)}
                  </span>{' '}
                  · Rata-rata:{' '}
                  <span className="font-mono">
                    {formatCurrency(dailyIncome.averagePerDay)}/hari
                  </span>
                </p>
              )}
            </CardHeader>
            <CardContent className="px-0 pt-2">
              {isDailyIncomeLoading ? (
                <Skeleton className="h-[240px] w-full" />
              ) : dailyIncomeChartData.length > 0 ? (
                <ReportLineChart
                  data={dailyIncomeChartData}
                  xKey="date"
                  yKey="income"
                  label="Pendapatan"
                  height={240}
                  tooltipFormatter={(v) => formatCurrency(v)}
                />
              ) : (
                <ChartEmptyState message="Belum ada transaksi pendapatan bulan ini." />
              )}
            </CardContent>
          </div>
        </Card>

        {/* Porsi Metode Pembayaran (Donut Chart) */}
        <Card className="p-4 shadow-1 bg-surface-raised border-border-default flex flex-col justify-between">
          <div>
            <CardHeader className="px-0 pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold text-text-primary flex items-center gap-2">
                  <CreditCard className="size-4 text-brand-primary" />
                  Metode Pembayaran
                </CardTitle>
                <Link
                  href="/reports/payment-methods"
                  className="text-xs text-brand-primary hover:underline inline-flex items-center gap-1"
                >
                  Detail <ArrowRight className="size-3" />
                </Link>
              </div>
              <p className="text-xs text-text-secondary">
                Porsi perolehan transaksi per rekening & e-wallet
              </p>
            </CardHeader>
            <CardContent className="px-0 pt-2">
              {isPaymentMethodsLoading ? (
                <Skeleton className="h-[240px] w-full" />
              ) : paymentMethodsPieData.length > 0 ? (
                <div className="space-y-3">
                  <ReportPieChart
                    data={paymentMethodsPieData}
                    height={160}
                    valueFormatter={(v) => formatCurrency(v)}
                  />
                  <div className="space-y-1.5 max-h-[100px] overflow-y-auto pr-1">
                    {paymentMethodsPieData.map((item, idx) => (
                      <div
                        key={item.name}
                        className="flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-1.5 truncate max-w-[140px]">
                          <span
                            className="size-2.5 rounded-full shrink-0"
                            style={{
                              backgroundColor:
                                item.color ??
                                CHART_COLORS[idx % CHART_COLORS.length],
                            }}
                          />
                          <span className="truncate text-text-secondary">
                            {item.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 font-mono">
                          <span className="font-semibold text-text-primary">
                            {item.percentage.toFixed(1)}%
                          </span>
                          <span className="text-text-tertiary text-[11px]">
                            ({formatCurrency(item.value)})
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <ChartEmptyState message="Belum ada transaksi pembayaran." />
              )}
            </CardContent>
          </div>
        </Card>
      </div>

      {/* Secondary Operational Panels: Top Products, Recent Sales, Action Required */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Top 5 Produk Terlaris */}
        <Card className="p-4 shadow-1 bg-surface-raised border-border-default">
          <CardHeader className="px-0 pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <ShoppingBag className="size-4 text-brand-primary" />
                Produk Terlaris Bulan Ini
              </CardTitle>
              <Link
                href="/reports/top-products"
                className="text-xs text-brand-primary hover:underline inline-flex items-center gap-1"
              >
                Semua <ArrowRight className="size-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-0 pt-2">
            {isTopProductsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((n) => (
                  <Skeleton key={n} className="h-9 w-full" />
                ))}
              </div>
            ) : (topProductsData?.rows ?? []).length === 0 ? (
              <p className="text-xs text-text-secondary py-4 text-center">
                Belum ada penjualan produk bulan ini.
              </p>
            ) : (
              <ul className="divide-y divide-border-default">
                {(topProductsData?.rows ?? []).map((p, idx) => (
                  <li
                    key={p.productId}
                    className="py-2 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="size-5 rounded-full bg-surface-muted text-text-secondary flex items-center justify-center font-bold text-[10px] shrink-0">
                        {idx + 1}
                      </span>
                      <span className="font-medium text-text-primary truncate">
                        {p.productName}
                      </span>
                    </div>
                    <div className="flex flex-col items-end font-mono shrink-0 ml-2">
                      <span className="font-semibold text-text-primary">
                        {p.quantitySold} terjual
                      </span>
                      <span className="text-[10px] text-text-tertiary">
                        {formatCurrency(p.revenue)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Transaksi Kasir Terakhir */}
        <Card className="p-4 shadow-1 bg-surface-raised border-border-default">
          <CardHeader className="px-0 pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <TrendingUp className="size-4 text-brand-primary" />
                Transaksi Terkini
              </CardTitle>
              <Link
                href="/sales/history"
                className="text-xs text-brand-primary hover:underline inline-flex items-center gap-1"
              >
                Riwayat <ArrowRight className="size-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-0 pt-2">
            {isRecentSalesLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((n) => (
                  <Skeleton key={n} className="h-9 w-full" />
                ))}
              </div>
            ) : (recentSalesData?.data ?? []).length === 0 ? (
              <p className="text-xs text-text-secondary py-4 text-center">
                Belum ada transaksi penjualan kasir.
              </p>
            ) : (
              <ul className="divide-y divide-border-default">
                {(recentSalesData?.data ?? []).map((sale) => (
                  <li
                    key={sale.id}
                    className="py-2 flex items-center justify-between text-xs"
                  >
                    <div className="truncate">
                      <p className="font-medium text-text-primary truncate font-mono">
                        {sale.id.slice(0, 8)}...
                      </p>
                      <p className="text-[10px] text-text-tertiary">
                        {new Date(sale.soldAt).toLocaleTimeString('id-ID', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        · {sale.branchName || 'Pusat'}
                      </p>
                    </div>
                    <div className="flex flex-col items-end font-mono shrink-0 ml-2">
                      <span className="font-semibold text-accent-inflow">
                        {formatCurrency(sale.totalAmount)}
                      </span>
                      <Badge
                        variant="outline"
                        className="text-[9px] px-1 py-0 h-4"
                      >
                        {sale.accountName || 'Kas'}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Perlu Perhatian & Tindakan Cepat */}
        <Card className="p-4 shadow-1 bg-surface-raised border-border-default">
          <CardHeader className="px-0 pb-2">
            <CardTitle className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <AlertTriangle className="size-4 text-status-warning" />
              Perlu Perhatian
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pt-2">
            {lowStockRows.length === 0 && suppliersWithUtang.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <div className="size-10 rounded-full bg-brand-tertiary-soft text-brand-tertiary flex items-center justify-center mb-2">
                  ✓
                </div>
                <p className="text-xs font-medium text-text-primary">
                  Semua Berjalan Lancar
                </p>
                <p className="text-[11px] text-text-tertiary mt-0.5">
                  Tidak ada stok menipis atau utang mendesak.
                </p>
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                {lowStockRows.length > 0 && (
                  <div className="p-2.5 rounded-md border border-status-warning/30 bg-amber-50/50 flex items-start gap-2.5">
                    <Package className="size-4 text-status-warning shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-semibold text-text-primary">
                        {lowStockRows.length} Bahan Baku Menipis
                      </p>
                      <p className="text-[11px] text-text-secondary mt-0.5">
                        Stok di bawah batas minimum pemakaian.
                      </p>
                      <Link
                        href="/inventory"
                        className="text-[11px] text-brand-primary font-medium hover:underline inline-flex items-center gap-1 mt-1.5"
                      >
                        Buka Lembar Kerja Inventaris{' '}
                        <ArrowRight className="size-3" />
                      </Link>
                    </div>
                  </div>
                )}

                {suppliersWithUtang.length > 0 && (
                  <div className="p-2.5 rounded-md border border-status-danger/30 bg-rose-50/50 flex items-start gap-2.5">
                    <Wallet className="size-4 text-status-danger shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-semibold text-text-primary">
                        {suppliersWithUtang.length} Supplier Menunggu Pelunasan
                      </p>
                      <p className="text-[11px] text-text-secondary mt-0.5">
                        Total utang terbuka saat ini aktif tercatat.
                      </p>
                      <Link
                        href="/expenses/payables"
                        className="text-[11px] text-brand-primary font-medium hover:underline inline-flex items-center gap-1 mt-1.5"
                      >
                        Buka Daftar Utang <ArrowRight className="size-3" />
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
