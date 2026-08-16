/**
 * OhMyPos — Dashboard 3 response mappers and raw-row types (plan §7.1).
 *
 * The raw-row interfaces live here, next to the code that consumes them, the
 * same way SaleWithRelations lives in sales.mapper.ts. Field names are the SQL
 * column ALIASES in snake_case — `$queryRaw` returns exactly what the query
 * named, with no camelCase conversion.
 *
 * Serialization boundary: money `.toFixed(2)`, quantity `.toFixed(4)`, applied
 * HERE and nowhere else (repo convention — raw-materials.service.ts, sales.mapper.ts).
 */
import type {
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
  /** `::int` in SQL — a bare COUNT(*) arrives as BigInt and breaks JSON (plan §4). */
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
 * ADR-017. `netProfit` subtracts COGS and operating expenses only; material
 * cash outflow is reported in the `cash` block and is NOT subtracted, because
 * that same cost is already inside `cogs` for whatever has been sold.
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
    rows: buckets.map((b) => ({
      date: b.date,
      income: b.income.toFixed(2),
      entryCount: b.entryCount,
    })),
    total: total.toFixed(2),
    averagePerDay: averagePerDay(total, period.dayCount).toFixed(2),
  };
}
