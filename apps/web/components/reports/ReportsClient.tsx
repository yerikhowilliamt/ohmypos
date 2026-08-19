'use client';

import * as React from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { BarChart3 } from 'lucide-react';
import { useBranches } from '@/hooks/useExpenses';
import {
  useDailyIncome,
  useIncomeByPaymentMethod,
  useProductProfit,
  useProfitLoss,
  type ReportFilters,
} from '@/hooks/useReports';
import { ReportFilterBar } from './ReportFilterBar';
import { ProfitLossView } from './ProfitLossView';
import { ProductProfitView } from './ProductProfitView';
import { IncomeByPaymentMethodView } from './IncomeByPaymentMethodView';
import { TopProductsView } from './TopProductsView';
import { DailyIncomeView } from './DailyIncomeView';

type TabId =
  | 'profit-loss'
  | 'product-profit'
  | 'income-by-payment-method'
  | 'top-products'
  | 'daily-income';

interface ReportsClientProps {
  forcedTab?: TabId;
}

/**
 * Local calendar date as `YYYY-MM-DD` — NOT `date.toISOString().slice(0, 10)`,
 * which reads UTC and silently shifts a day backward in any positive-UTC-offset
 * timezone (WIB is UTC+7, ADR-018's whole point). Same fix DatePicker already
 * applies (packages/ui/src/components/ui/date-picker.tsx).
 */
function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Default range: the 1st of the current month through today. */
function getDefaultRange(): { startDate: string; endDate: string } {
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  return { startDate: toIsoDate(firstOfMonth), endDate: toIsoDate(now) };
}

const REPORT_TITLES: Record<TabId, { title: string; desc: string }> = {
  'profit-loss': {
    title: 'Laba Rugi',
    desc: 'Laporan ringkasan performa pendapatan, HPP, dan laba operasional.',
  },
  'product-profit': {
    title: 'Laba per Produk',
    desc: 'Rincian margin laba kotor, omzet, dan estimasi HPP per item produk.',
  },
  'income-by-payment-method': {
    title: 'Pendapatan per Metode Bayar',
    desc: 'Total perolehan uang masuk berdasarkan akun kas atau transfer.',
  },
  'top-products': {
    title: '10 Produk Terlaris',
    desc: 'Peringkat menu dengan volume penjualan dan keuntungan tertinggi.',
  },
  'daily-income': {
    title: 'Pendapatan Harian',
    desc: 'Grafik dan tren omzet penjualan harian dalam rentang tanggal terpilih.',
  },
};

/**
 * Dashboard 3 (PRD §5.4) — OWNER-only reports, all backed by the read-only
 * Phase 7 endpoints (ADR-008: computed at query time, nothing recomputed
 * here). One shared filter bar drives all views; only the active tab's
 * query is enabled so switching pages doesn't fire five requests at once.
 */
export function ReportsClient({ forcedTab }: ReportsClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const defaultRange = React.useMemo(() => getDefaultRange(), []);

  const startDate = searchParams.get('startDate') || defaultRange.startDate;
  const endDate = searchParams.get('endDate') || defaultRange.endDate;
  const branchId = searchParams.get('branchId') || undefined;

  const activeTab: TabId = React.useMemo(() => {
    if (forcedTab) return forcedTab;
    if (pathname.includes('/product-profit')) return 'product-profit';
    if (pathname.includes('/payment-methods'))
      return 'income-by-payment-method';
    if (pathname.includes('/top-products')) return 'top-products';
    if (pathname.includes('/daily')) return 'daily-income';
    return 'profit-loss';
  }, [forcedTab, pathname]);

  const updateParams = React.useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams],
  );

  const { data: branches = [] } = useBranches();

  const filters: ReportFilters = React.useMemo(
    () => ({ startDate, endDate, branchId }),
    [startDate, endDate, branchId],
  );
  const isRangeValid = Boolean(startDate && endDate && startDate <= endDate);

  const profitLoss = useProfitLoss(
    filters,
    isRangeValid && activeTab === 'profit-loss',
  );
  const productProfit = useProductProfit(
    filters,
    isRangeValid && activeTab === 'product-profit',
  );
  const incomeByPaymentMethod = useIncomeByPaymentMethod(
    filters,
    isRangeValid && activeTab === 'income-by-payment-method',
  );
  const dailyIncome = useDailyIncome(
    filters,
    isRangeValid && activeTab === 'daily-income',
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <BarChart3 className="size-6 text-brand-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            {REPORT_TITLES[activeTab].title}
          </h1>
          <p className="text-sm text-text-secondary">
            {REPORT_TITLES[activeTab].desc}
          </p>
        </div>
      </div>

      <ReportFilterBar
        startDate={startDate}
        endDate={endDate}
        branchId={branchId}
        branches={branches}
        onStartDateChange={(value) => updateParams({ startDate: value })}
        onEndDateChange={(value) => updateParams({ endDate: value })}
        onBranchChange={(value) => updateParams({ branchId: value })}
      />

      {activeTab === 'profit-loss' && (
        <ProfitLossView
          data={profitLoss.data}
          isLoading={profitLoss.isLoading}
        />
      )}

      {activeTab === 'product-profit' && (
        <ProductProfitView
          data={productProfit.data}
          isLoading={productProfit.isLoading}
        />
      )}

      {activeTab === 'income-by-payment-method' && (
        <IncomeByPaymentMethodView
          data={incomeByPaymentMethod.data}
          isLoading={incomeByPaymentMethod.isLoading}
        />
      )}

      {activeTab === 'top-products' && (
        <TopProductsView
          filters={filters}
          enabled={isRangeValid && activeTab === 'top-products'}
        />
      )}

      {activeTab === 'daily-income' && (
        <DailyIncomeView
          data={dailyIncome.data}
          isLoading={dailyIncome.isLoading}
        />
      )}
    </div>
  );
}
