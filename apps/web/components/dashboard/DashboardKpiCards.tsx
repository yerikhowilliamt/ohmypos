'use client';

import * as React from 'react';
import type {
  CashBalanceResponse,
  InventorySummaryResponse,
  PayableSupplierSummary,
  ProfitLossResponse,
} from '@ohmypos/api-contracts';
import { Card, CardContent } from '@ohmypos/ui/components/card';
import { formatCurrency } from '@/lib/formatters';
import { Wallet, TrendingUp, Receipt, ShieldAlert } from 'lucide-react';

interface DashboardKpiCardsProps {
  cashBalance: CashBalanceResponse | undefined;
  profitLoss: ProfitLossResponse | undefined;
  payablesSummary: PayableSupplierSummary[] | undefined;
  inventorySummary: InventorySummaryResponse | undefined;
  isLoading?: boolean;
}

export function DashboardKpiCards({
  cashBalance,
  profitLoss,
  payablesSummary,
  inventorySummary,
  isLoading = false,
}: DashboardKpiCardsProps) {
  const netProfit = profitLoss ? Number(profitLoss.netProfit) : 0;
  const isNetProfitNegative = netProfit < 0;

  const totalUtang = (payablesSummary ?? []).reduce(
    (sum, s) => sum + Number(s.totalOutstanding),
    0,
  );
  const suppliersWithUtang = (payablesSummary ?? []).filter(
    (s) => s.openPayableCount > 0,
  ).length;

  // NOTE: field is `data`, not `rows` — InventorySummaryResponseSchema is
  // `{ period, data: [...] }` (packages/api-contracts/src/inventory-summary.schema.ts). See §0.1.
  const lowStockCount = (inventorySummary?.data ?? []).filter(
    (row) => row.status !== 'OK',
  ).length;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {/* Kas */}
      <Card className="p-3 shadow-1 bg-surface-raised border-border-default">
        <CardContent className="p-0 flex items-center justify-between">
          <div>
            <p className="text-xs text-text-tertiary">Kas</p>
            <p className="mt-1 text-xl font-bold font-mono text-text-primary">
              {isLoading ? '—' : formatCurrency(cashBalance?.totalBalance)}
            </p>
            <p className="text-[11px] text-text-secondary mt-0.5">
              {isLoading ? '…' : 'per hari ini'}
            </p>
          </div>
          <div className="size-9 rounded-sm bg-brand-primary flex items-center justify-center text-white shadow-1">
            <Wallet className="size-5 text-white" />
          </div>
        </CardContent>
      </Card>

      {/* Laba Bersih Bulan Ini */}
      <Card className="p-3 shadow-1 bg-surface-raised border-border-default">
        <CardContent className="p-0 flex items-center justify-between">
          <div>
            <p className="text-xs text-text-tertiary">Laba Bersih Bulan Ini</p>
            <p
              className={`mt-1 text-xl font-bold font-mono ${
                isNetProfitNegative ? 'text-status-danger' : 'text-text-primary'
              }`}
            >
              {isLoading ? '—' : formatCurrency(profitLoss?.netProfit)}
            </p>
            <p className="text-[11px] text-text-secondary mt-0.5">
              {isLoading
                ? '…'
                : profitLoss?.netMarginPct !== null &&
                    profitLoss?.netMarginPct !== undefined
                  ? `${profitLoss.netMarginPct}% margin`
                  : 'margin tidak tersedia'}
            </p>
          </div>
          <div className="size-9 rounded-sm bg-brand-primary flex items-center justify-center text-white shadow-1">
            <TrendingUp className="size-5 text-white" />
          </div>
        </CardContent>
      </Card>

      {/* Utang Supplier */}
      <Card className="p-3 shadow-1 bg-surface-raised border-border-default">
        <CardContent className="p-0 flex items-center justify-between">
          <div>
            <p className="text-xs text-text-tertiary">Utang Supplier</p>
            <p
              className={`mt-1 text-xl font-bold font-mono ${
                totalUtang > 0 ? 'text-status-warning' : 'text-text-primary'
              }`}
            >
              {isLoading ? '—' : formatCurrency(String(totalUtang))}
            </p>
            <p className="text-[11px] text-text-secondary mt-0.5">
              {isLoading ? '…' : `${suppliersWithUtang} supplier`}
            </p>
          </div>
          <div
            className={`size-9 rounded-sm flex items-center justify-center shadow-1 ${
              totalUtang > 0
                ? 'bg-status-warning text-white'
                : 'bg-surface-muted text-text-tertiary'
            }`}
          >
            <Receipt className="size-5" />
          </div>
        </CardContent>
      </Card>

      {/* Stok Rendah */}
      <Card
        className={`p-3 shadow-1 bg-surface-raised border-border-default ${lowStockCount > 0 ? 'bg-status-danger/25' : 'border-border-default'}`}
      >
        <CardContent className="p-0 flex items-center justify-between">
          <div>
            <p className="text-xs text-text-tertiary">Stok Rendah</p>
            <p
              className={`mt-1 text-xl font-bold font-mono ${
                lowStockCount > 0 ? 'text-status-danger' : 'text-text-primary'
              }`}
            >
              {isLoading ? '—' : lowStockCount}
            </p>
            <p className="text-[11px] text-text-secondary mt-0.5">
              {isLoading
                ? '…'
                : lowStockCount > 0
                  ? 'perlu restock'
                  : 'stok aman'}
            </p>
          </div>
          <div
            className={`size-9 rounded-sm flex items-center justify-center shadow-1 ${
              lowStockCount > 0
                ? 'bg-status-danger text-white'
                : 'bg-surface-muted text-text-tertiary'
            }`}
          >
            <ShieldAlert className="size-5" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
