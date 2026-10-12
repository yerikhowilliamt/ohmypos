import type {
  CashBalanceResponse,
  DailyIncomeResponse,
  IncomeByPaymentMethodResponse,
  ProductProfitResponse,
  ProductProfitRow,
  ProductRankBy,
  ProfitLossResponse,
  ReportPeriod,
  TopProductsResponse,
} from '@ohmypos/api-contracts';
import { Prisma } from '../../generated/prisma/client';
import type { ReportRange } from '../../common/period';
import {
  averagePerDay,
  percentageOf,
  sumDecimals,
  type DailyIncomeBucket,
} from './report-math';

/** One row, always exactly one — the query has no GROUP BY. */
export interface ProfitLossMoneyRow {
  sales_revenue: Prisma.Decimal;
  other_income: Prisma.Decimal;
  operating_expenses: Prisma.Decimal;
  material_cash_outflow: Prisma.Decimal;
  total_inflow: Prisma.Decimal;
  total_outflow: Prisma.Decimal;
}

export interface ProfitLossCogsRow {
  cogs: Prisma.Decimal;
  /** Cast `::int` in SQL; a bare COUNT(*) arrives as BigInt. */
  sale_count: number;
}

export interface ProductAggregateRow {
  product_id: string;
  product_name: string;
  quantity_sold: Prisma.Decimal;
  revenue: Prisma.Decimal;
  cogs: Prisma.Decimal;
  line_count: number;
}

export interface IncomeByAccountRow {
  account_id: string;
  account_name: string;
  account_type: 'BANK' | 'CASH' | 'EWALLET';
  total: Prisma.Decimal;
  sales_total: Prisma.Decimal;
  other_total: Prisma.Decimal;
  entry_count: number;
}

export interface DailyIncomeQueryRow {
  day: string;
  income: Prisma.Decimal;
  entry_count: number;
}

export interface DailyCogsQueryRow {
  day: string;
  cogs: Prisma.Decimal;
}

export interface DailyOperatingExpenseQueryRow {
  day: string;
  operating_expenses: Prisma.Decimal;
}

/** One row per account, including accounts with no ledger activity. */
export interface CashBalanceRow {
  account_id: string;
  account_name: string;
  account_type: 'BANK' | 'CASH' | 'EWALLET';
  opening_balance: Prisma.Decimal;
  total_inflow: Prisma.Decimal;
  total_outflow: Prisma.Decimal;
}

export function toReportPeriod(
  range: ReportRange,
  branchId: string | null,
  branchName: string | null,
): ReportPeriod {
  return {
    startDate: range.startDate,
    endDate: range.endDate,
    timezone: 'Asia/Jakarta',
    dayCount: range.dayCount,
    branchId,
    branchName,
  };
}

/**
 * `netProfit` subtracts COGS and operating expenses only. Material cash outflow
 * is reported in `cash` and never subtracted, since it is already in COGS (ADR-017).
 */
export function toProfitLossResponse(
  period: ReportPeriod,
  money: ProfitLossMoneyRow,
  cogsRow: ProfitLossCogsRow,
): ProfitLossResponse {
  const totalIncome = money.sales_revenue.plus(money.other_income);
  const grossProfit = totalIncome.minus(cogsRow.cogs);
  const netProfit = grossProfit.minus(money.operating_expenses);
  const netCashFlow = money.total_inflow.minus(money.total_outflow);

  return {
    period,
    salesRevenue: money.sales_revenue.toFixed(2),
    otherIncome: money.other_income.toFixed(2),
    totalIncome: totalIncome.toFixed(2),
    cogs: cogsRow.cogs.toFixed(2),
    grossProfit: grossProfit.toFixed(2),
    operatingExpenses: money.operating_expenses.toFixed(2),
    netProfit: netProfit.toFixed(2),
    netMarginPct: percentageOf(netProfit, totalIncome),
    cash: {
      totalInflow: money.total_inflow.toFixed(2),
      totalOutflow: money.total_outflow.toFixed(2),
      materialCashOutflow: money.material_cash_outflow.toFixed(2),
      netCashFlow: netCashFlow.toFixed(2),
    },
    saleCount: cogsRow.sale_count,
  };
}

function toProductProfitRow(row: ProductAggregateRow): ProductProfitRow {
  const grossProfit = row.revenue.minus(row.cogs);
  return {
    productId: row.product_id,
    productName: row.product_name,
    quantitySold: row.quantity_sold.toFixed(4),
    revenue: row.revenue.toFixed(2),
    cogs: row.cogs.toFixed(2),
    grossProfit: grossProfit.toFixed(2),
    marginPct: percentageOf(grossProfit, row.revenue),
    lineCount: row.line_count,
  };
}

export function toProductProfitResponse(
  period: ReportPeriod,
  rows: ProductAggregateRow[],
): ProductProfitResponse {
  const revenue = sumDecimals(rows.map((r) => r.revenue));
  const cogs = sumDecimals(rows.map((r) => r.cogs));

  return {
    period,
    rows: rows.map(toProductProfitRow),
    totals: {
      revenue: revenue.toFixed(2),
      cogs: cogs.toFixed(2),
      grossProfit: revenue.minus(cogs).toFixed(2),
    },
  };
}

export function toTopProductsResponse(
  period: ReportPeriod,
  rankBy: ProductRankBy,
  rows: ProductAggregateRow[],
): TopProductsResponse {
  return {
    period,
    rankBy,
    rows: rows.map((row, index) => ({
      ...toProductProfitRow(row),
      rank: index + 1,
    })),
  };
}

export function toIncomeByPaymentMethodResponse(
  period: ReportPeriod,
  rows: IncomeByAccountRow[],
): IncomeByPaymentMethodResponse {
  const total = sumDecimals(rows.map((r) => r.total));

  return {
    period,
    rows: rows.map((row) => ({
      accountId: row.account_id,
      accountName: row.account_name,
      accountType: row.account_type,
      total: row.total.toFixed(2),
      salesTotal: row.sales_total.toFixed(2),
      otherTotal: row.other_total.toFixed(2),
      sharePct: percentageOf(row.total, total),
      entryCount: row.entry_count,
    })),
    total: total.toFixed(2),
  };
}

export function toDailyIncomeResponse(
  period: ReportPeriod,
  buckets: DailyIncomeBucket[],
): DailyIncomeResponse {
  const total = sumDecimals(buckets.map((b) => b.income));

  return {
    period,
    rows: buckets.map((b) => {
      const netProfit = b.income.minus(b.cogs).minus(b.operatingExpenses);
      return {
        date: b.date,
        income: b.income.toFixed(2),
        cogs: b.cogs.toFixed(2),
        netProfit: netProfit.toFixed(2),
        entryCount: b.entryCount,
      };
    }),
    total: total.toFixed(2),
    averagePerDay: averagePerDay(total, period.dayCount).toFixed(2),
  };
}

export function toCashBalanceResponse(
  asOfDate: string,
  rows: CashBalanceRow[],
): CashBalanceResponse {
  const accounts = rows.map((row) => {
    const netMovement = row.total_inflow.minus(row.total_outflow);
    const balance = row.opening_balance.plus(netMovement);
    return {
      accountId: row.account_id,
      accountName: row.account_name,
      accountType: row.account_type,
      openingBalance: row.opening_balance.toFixed(2),
      netMovement: netMovement.toFixed(2),
      balance: balance.toFixed(2),
    };
  });

  const totalBalance = sumDecimals(
    rows.map((row) =>
      row.opening_balance.plus(row.total_inflow.minus(row.total_outflow)),
    ),
  );

  return {
    asOfDate,
    timezone: 'Asia/Jakarta',
    totalBalance: totalBalance.toFixed(2),
    accounts,
  };
}
