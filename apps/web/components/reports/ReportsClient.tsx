'use client';

import * as React from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { BarChart3 } from 'lucide-react';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@ohmypos/ui/components/tabs';
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

const TABS = [
  { id: 'profit-loss', label: 'Laba Rugi' },
  { id: 'product-profit', label: 'Laba per Produk' },
  { id: 'income-by-payment-method', label: 'Pendapatan per Metode Bayar' },
  { id: 'top-products', label: '10 Produk Terlaris' },
  { id: 'daily-income', label: 'Pendapatan Harian' },
] as const;
type TabId = (typeof TABS)[number]['id'];
const DEFAULT_TAB: TabId = 'profit-loss';
const TAB_IDS = TABS.map((t) => t.id);

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

/**
 * Dashboard 3 (PRD §5.4) — OWNER-only reports, all backed by the read-only
 * Phase 7 endpoints (ADR-008: computed at query time, nothing recomputed
 * here). One shared filter bar drives all five tabs; only the active tab's
 * query is enabled so switching tabs doesn't fire five requests at once.
 */
export function ReportsClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const defaultRange = React.useMemo(() => getDefaultRange(), []);

  const startDate = searchParams.get('startDate') || defaultRange.startDate;
  const endDate = searchParams.get('endDate') || defaultRange.endDate;
  const branchId = searchParams.get('branchId') || undefined;
  const rawTab = searchParams.get('tab');
  const activeTab: TabId = (TAB_IDS as readonly string[]).includes(rawTab ?? '')
    ? (rawTab as TabId)
    : DEFAULT_TAB;

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
            Laporan
          </h1>
          <p className="text-sm text-text-secondary">
            Laba rugi, penjualan, dan arus kas — terkonsolidasi per rentang
            tanggal dan cabang.
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

      <Tabs
        value={activeTab}
        onValueChange={(value) => updateParams({ tab: value })}
      >
        <div className="overflow-x-auto">
          <TabsList className="w-max">
            {TABS.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} className="shrink-0">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="profit-loss">
          <ProfitLossView
            data={profitLoss.data}
            isLoading={profitLoss.isLoading}
          />
        </TabsContent>

        <TabsContent value="product-profit">
          <ProductProfitView
            data={productProfit.data}
            isLoading={productProfit.isLoading}
          />
        </TabsContent>

        <TabsContent value="income-by-payment-method">
          <IncomeByPaymentMethodView
            data={incomeByPaymentMethod.data}
            isLoading={incomeByPaymentMethod.isLoading}
          />
        </TabsContent>

        <TabsContent value="top-products">
          <TopProductsView
            filters={filters}
            enabled={isRangeValid && activeTab === 'top-products'}
          />
        </TabsContent>

        <TabsContent value="daily-income">
          <DailyIncomeView
            data={dailyIncome.data}
            isLoading={dailyIncome.isLoading}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
