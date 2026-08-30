/**
 * OhMyPos — Reporting service, Dashboard 3 (PRD §5.4, ADR-005, ADR-008,
 * ADR-014, ADR-017, ADR-018, System Design §6.6/§11).
 *
 * READ ONLY. Every method is a SELECT. There is no $transaction anywhere in
 * this file and there must never be one — Playbook §7 governs writes, and this
 * module performs none.
 *
 * COGS ALWAYS comes from `sale_items.hpp_at_sale`, the per-unit snapshot frozen
 * at sale time (ADR-005, ADR-015). This file must never import calculateHpp,
 * never read RawMaterial.unitCost, and never touch RecipeItem — doing so makes
 * historical reports change retroactively when a material's price changes,
 * which is the exact bug AGENTS.md's Troubleshooting table warns about.
 *
 * Aggregation happens in Postgres, not in Node: `SUM(hpp_at_sale * quantity)`
 * over a month is ~80k rows that must never cross the wire (plan §5).
 *
 * ALIAS CONTRACT (report-filters.ts): ledger_entries AS le, sales AS s,
 * sale_items AS si, products AS p, accounts AS a.
 */
import { Injectable } from '@nestjs/common';
import type {
  CashBalanceResponse,
  DailyIncomeResponse,
  IncomeByPaymentMethodResponse,
  ProductProfitResponse,
  ProductRankBy,
  ProfitLossResponse,
  TopProductsResponse,
} from '@ohmypos/api-contracts';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  eachWibDay,
  resolveReportRange,
  todayWib,
  type ReportRange,
} from '../../common/period';
import {
  ledgerScope,
  saleScope,
  tenantScope,
  wibDayOfEntryDate,
  wibDayOfSoldAt,
} from './report-filters';
import { fillDailyGaps } from './report-math';
import {
  toCashBalanceResponse,
  toDailyIncomeResponse,
  toIncomeByPaymentMethodResponse,
  toProductProfitResponse,
  toProfitLossResponse,
  toReportPeriod,
  toTopProductsResponse,
  type CashBalanceRow,
  type DailyCogsQueryRow,
  type DailyIncomeQueryRow,
  type DailyOperatingExpenseQueryRow,
  type IncomeByAccountRow,
  type ProductAggregateRow,
  type ProfitLossCogsRow,
  type ProfitLossMoneyRow,
} from './reports.mapper';
import type {
  CashBalanceQueryDto,
  ReportRangeQueryDto,
  TopProductsQueryDto,
} from './reports.dto';

/**
 * The ORDER BY per ranking metric, as pre-built SQL fragments.
 *
 * A lookup object, NOT string interpolation of `query.rankBy` — even though Zod
 * has already constrained the value to three literals. An ORDER BY built from a
 * request string is the one place in this module where a future edit could turn
 * a validated enum into injected SQL.
 */
const PRODUCT_ORDER_BY: Record<ProductRankBy, Prisma.Sql> = {
  quantity: Prisma.sql`SUM(si.quantity) DESC`,
  revenue: Prisma.sql`ROUND(SUM(si.line_total), 2) DESC`,
  profit: Prisma.sql`(ROUND(SUM(si.line_total), 2) - ROUND(SUM(si.hpp_at_sale * si.quantity), 2)) DESC`,
};

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves the range and the branch label shared by all five reports.
   *
   * An unknown branchId is NOT a 404 (plan decision 10): a filter matching
   * nothing is an empty result set, so the report returns zeros with
   * `branchName: null`.
   */
  private async resolveContext(query: ReportRangeQueryDto) {
    const range = resolveReportRange(query.startDate, query.endDate);
    const branch = query.branchId
      ? await this.prisma.branch.findUnique({ where: { id: query.branchId } })
      : null;

    return {
      range,
      period: toReportPeriod(
        range,
        query.branchId ?? null,
        branch?.name ?? null,
      ),
    };
  }

  /** ADR-017 §2 — the margin view and the cash view, computed in two passes. */
  async profitLoss(query: ReportRangeQueryDto): Promise<ProfitLossResponse> {
    const { range, period } = await this.resolveContext(query);
    const ledgerWhere = ledgerScope(range, query.branchId);
    const saleWhere = saleScope(range, query.branchId);

    const [moneyRows, cogsRows] = await Promise.all([
      this.prisma.$queryRaw<ProfitLossMoneyRow[]>`
        SELECT
          COALESCE(SUM(le.amount) FILTER (WHERE le.type = 'INFLOW'  AND le.source_type =  'SALE' AND (s.id IS NULL OR s.status <> 'VOIDED')), 0)   AS sales_revenue,
          COALESCE(SUM(le.amount) FILTER (WHERE le.type = 'INFLOW'  AND le.source_type <> 'SALE'), 0)   AS other_income,
          COALESCE(SUM(le.amount) FILTER (WHERE le.type = 'OUTFLOW' AND le.source_type =  'MANUAL'), 0) AS operating_expenses,
          COALESCE(SUM(le.amount) FILTER (WHERE le.type = 'OUTFLOW'
                   AND le.source_type IN ('PURCHASE', 'PAYABLE_SETTLEMENT')), 0)                        AS material_cash_outflow,
          COALESCE(SUM(le.amount) FILTER (WHERE le.type = 'INFLOW'), 0)                                 AS total_inflow,
          COALESCE(SUM(le.amount) FILTER (WHERE le.type = 'OUTFLOW'), 0)                                AS total_outflow
        FROM ledger_entries le
        -- DEBT-010: only join is used to exclude a voided sale's original
        -- INFLOW from sales_revenue — total_inflow/total_outflow stay
        -- unconditional on source_type/status by design, so a void's real
        -- reversal OUTFLOW still nets the cash view to zero (see
        -- report-filters.ts's saleScope() doc comment for the full split).
        LEFT JOIN sales s ON le.source_type = 'SALE' AND le.source_id = s.id AND s.tenant_id = le.tenant_id
        WHERE ${ledgerWhere}`,
      this.prisma.$queryRaw<ProfitLossCogsRow[]>`
        SELECT
          COALESCE(ROUND(SUM(si.hpp_at_sale * si.quantity), 2), 0) AS cogs,
          COUNT(DISTINCT s.id)::int                                AS sale_count
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        WHERE ${saleWhere}`,
    ]);

    return toProfitLossResponse(period, moneyRows[0], cogsRows[0]);
  }

  /**
   * The shared product aggregate behind BOTH product-profit and top-products —
   * the two reports differ only in ORDER BY and LIMIT.
   *
   * `SUM(si.hpp_at_sale * si.quantity)` is the expression Prisma's groupBy
   * cannot express, and the reason this module uses raw SQL at all (plan §4).
   * The sum is exact and rounded ONCE (plan §2).
   */
  private async productAggregate(
    range: ReportRange,
    branchId: string | undefined,
    rankBy: ProductRankBy,
    limit: number | null,
  ): Promise<ProductAggregateRow[]> {
    const saleWhere = saleScope(range, branchId);
    const orderBy = PRODUCT_ORDER_BY[rankBy];
    // A bound LIMIT parameter, or no LIMIT clause at all for the full report.
    const limitClause =
      limit === null ? Prisma.empty : Prisma.sql`LIMIT ${limit}`;

    return this.prisma.$queryRaw<ProductAggregateRow[]>`
      SELECT
        si.product_id                                            AS product_id,
        p.name                                                   AS product_name,
        COALESCE(SUM(si.quantity), 0)                            AS quantity_sold,
        COALESCE(ROUND(SUM(si.line_total), 2), 0)                AS revenue,
        COALESCE(ROUND(SUM(si.hpp_at_sale * si.quantity), 2), 0) AS cogs,
        COUNT(*)::int                                            AS line_count
      FROM sale_items si
      JOIN sales s    ON s.id = si.sale_id
      JOIN products p ON p.id = si.product_id
      WHERE ${saleWhere}
      GROUP BY si.product_id, p.name
      ORDER BY ${orderBy}, p.name ASC, si.product_id ASC
      ${limitClause}`;
  }

  async productProfit(
    query: ReportRangeQueryDto,
  ): Promise<ProductProfitResponse> {
    const { range, period } = await this.resolveContext(query);
    const rows = await this.productAggregate(
      range,
      query.branchId,
      'revenue',
      null,
    );
    return toProductProfitResponse(period, rows);
  }

  async topProducts(query: TopProductsQueryDto): Promise<TopProductsResponse> {
    const { range, period } = await this.resolveContext(query);
    const rows = await this.productAggregate(
      range,
      query.branchId,
      query.rankBy,
      query.limit,
    );
    return toTopProductsResponse(period, query.rankBy, rows);
  }

  /**
   * Grouped from `ledger_entries`, not from `sales`, so this report's total
   * equals ProfitLossResponse.totalIncome by construction — manual income
   * entries carry an account too (plan decision 4).
   */
  async incomeByPaymentMethod(
    query: ReportRangeQueryDto,
  ): Promise<IncomeByPaymentMethodResponse> {
    const { range, period } = await this.resolveContext(query);
    const ledgerWhere = ledgerScope(range, query.branchId);

    const rows = await this.prisma.$queryRaw<IncomeByAccountRow[]>`
      SELECT
        le.account_id                                                                                          AS account_id,
        a.name                                                                                                  AS account_name,
        a.type                                                                                                  AS account_type,
        COALESCE(SUM(le.amount), 0)                                                                             AS total,
        COALESCE(SUM(le.amount) FILTER (WHERE le.source_type = 'SALE' AND (s.id IS NULL OR s.status <> 'VOIDED')), 0) AS sales_total,
        COALESCE(SUM(le.amount) FILTER (WHERE le.source_type <> 'SALE'), 0)                                    AS other_total,
        COUNT(*)::int                                                                                           AS entry_count
      FROM ledger_entries le
      JOIN accounts a ON a.id = le.account_id
      -- DEBT-010: same voided-sale exclusion as profitLoss()'s moneyRows.
      LEFT JOIN sales s ON le.source_type = 'SALE' AND le.source_id = s.id AND s.tenant_id = le.tenant_id
      WHERE le.type = 'INFLOW' AND ${ledgerWhere}
      GROUP BY le.account_id, a.name, a.type
      ORDER BY total DESC, a.name ASC`;

    return toIncomeByPaymentMethodResponse(period, rows);
  }

  /**
   * Buckets by WIB calendar day (ADR-018). Days with no income are absent from
   * the SQL result and are zero-filled in TypeScript so a trend chart gets a
   * continuous series (plan §6.7).
   */
  /**
   * Merges three independently-grouped day-bucketed aggregates (income from
   * ledger INFLOW, COGS from sale_items/sales, operating expenses from ledger
   * OUTFLOW) so the response can carry `netProfit` per day alongside `income`
   * — the same `netProfit` definition as `profitLoss()`, just per-day instead
   * of per-period.
   */
  async dailyIncome(query: ReportRangeQueryDto): Promise<DailyIncomeResponse> {
    const { range, period } = await this.resolveContext(query);
    const ledgerWhere = ledgerScope(range, query.branchId);
    const saleWhere = saleScope(range, query.branchId);
    const wibDay = wibDayOfEntryDate();

    const [incomeRows, cogsRows, opexRows] = await Promise.all([
      this.prisma.$queryRaw<DailyIncomeQueryRow[]>`
        SELECT
          ${wibDay}                   AS day,
          COALESCE(SUM(le.amount), 0) AS income,
          COUNT(*)::int               AS entry_count
        FROM ledger_entries le
        -- DEBT-010: same voided-sale exclusion as profitLoss()'s moneyRows —
        -- non-sale INFLOW rows (le.source_type <> 'SALE') never match this
        -- join, so they're unaffected either way.
        LEFT JOIN sales s ON le.source_type = 'SALE' AND le.source_id = s.id AND s.tenant_id = le.tenant_id
        WHERE le.type = 'INFLOW' AND (s.id IS NULL OR s.status <> 'VOIDED') AND ${ledgerWhere}
        GROUP BY 1`,
      this.prisma.$queryRaw<DailyCogsQueryRow[]>`
        SELECT
          ${wibDayOfSoldAt()}                                       AS day,
          COALESCE(ROUND(SUM(si.hpp_at_sale * si.quantity), 2), 0)  AS cogs
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        WHERE ${saleWhere}
        GROUP BY 1`,
      this.prisma.$queryRaw<DailyOperatingExpenseQueryRow[]>`
        SELECT
          ${wibDay}                   AS day,
          COALESCE(SUM(le.amount), 0) AS operating_expenses
        FROM ledger_entries le
        WHERE le.type = 'OUTFLOW' AND le.source_type = 'MANUAL' AND ${ledgerWhere}
        GROUP BY 1`,
    ]);

    const incomeByDay = new Map(incomeRows.map((row) => [row.day, row]));
    const cogsByDay = new Map(cogsRows.map((row) => [row.day, row.cogs]));
    const opexByDay = new Map(
      opexRows.map((row) => [row.day, row.operating_expenses]),
    );
    // A day can have a MANUAL expense with zero sales — merging only over
    // incomeRows' days would silently drop that expense from netProfit.
    const allDays = new Set([
      ...incomeByDay.keys(),
      ...cogsByDay.keys(),
      ...opexByDay.keys(),
    ]);

    const present = Array.from(allDays).map((day) => ({
      date: day,
      income: incomeByDay.get(day)?.income ?? new Prisma.Decimal(0),
      entryCount: incomeByDay.get(day)?.entry_count ?? 0,
      cogs: cogsByDay.get(day) ?? new Prisma.Decimal(0),
      operatingExpenses: opexByDay.get(day) ?? new Prisma.Decimal(0),
    }));

    const buckets = fillDailyGaps(eachWibDay(range), present);

    return toDailyIncomeResponse(period, buckets);
  }

  /**
   * Running balance, not a range report: opening balance plus every ledger
   * movement strictly before `asOfDate`'s exclusive WIB boundary. Deliberately
   * NOT built on `ledgerScope` (report-filters.ts) — that helper assumes a
   * bounded [from, to) window and a `branchId` filter; this query has neither
   * a lower bound nor a branch filter, so it is written out in full here
   * rather than forcing an unbounded query through a bounded-range helper.
   */
  async cashBalance(query: CashBalanceQueryDto): Promise<CashBalanceResponse> {
    const asOfDate = query.asOfDate ?? todayWib(new Date());
    const cutoff = resolveReportRange(asOfDate, asOfDate).from;

    const rows = await this.prisma.$queryRaw<CashBalanceRow[]>`
      SELECT
        a.id                                                                                       AS account_id,
        a.name                                                                                      AS account_name,
        a.type                                                                                      AS account_type,
        a.opening_balance                                                                            AS opening_balance,
        COALESCE(SUM(le.amount) FILTER (WHERE le.type = 'INFLOW'  AND le.entry_date < ${cutoff}), 0) AS total_inflow,
        COALESCE(SUM(le.amount) FILTER (WHERE le.type = 'OUTFLOW' AND le.entry_date < ${cutoff}), 0) AS total_outflow
      FROM accounts a
      LEFT JOIN ledger_entries le ON le.account_id = a.id AND le.tenant_id = a.tenant_id
      WHERE ${tenantScope('a')}
      GROUP BY a.id, a.name, a.type, a.opening_balance
      ORDER BY a.name ASC, a.id ASC`;

    return toCashBalanceResponse(asOfDate, rows);
  }
}
