/**
 * OhMyPos — shared SQL fragments for Dashboard 3 (plan §6.5, ADR-008, ADR-018).
 *
 * "In this date range" and "in this branch" are defined ONCE here and reused by
 * all five reports. Five hand-written copies of the same predicate is how a
 * report suite drifts apart one `>=` at a time.
 *
 * ALIAS CONTRACT — every query in reports.service.ts MUST use these aliases:
 *   ledger_entries AS le      sales AS s      sale_items AS si     products AS p
 * The fragments below reference those aliases directly. Renaming an alias in a
 * query without changing it here produces a SQL error, not a wrong number, so
 * the failure is loud.
 *
 * Every value is a BOUND PARAMETER via `Prisma.sql`. Never build a fragment by
 * string concatenation — the same rule as stock-movements.service.ts:80.
 */
import { Prisma } from '../../generated/prisma/client';
import { REPORT_TIMEZONE, type ReportRange } from '../../common/period';

/** `le.entry_date >= from AND le.entry_date < to [AND le.branch_id = ...]` */
export function ledgerScope(range: ReportRange, branchId?: string): Prisma.Sql {
  const branch = branchId
    ? Prisma.sql` AND le.branch_id = ${branchId}`
    : Prisma.empty;
  return Prisma.sql`le.entry_date >= ${range.from} AND le.entry_date < ${range.to}${branch}`;
}

/**
 * `s.sold_at >= from AND s.sold_at < to [AND s.branch_id = ...] AND s.status <> 'VOIDED'`
 *
 * Sale-side reports filter on the PARENT sale, never on sale_items — a
 * SaleItem has neither a date nor a branch of its own (ERD §3).
 *
 * DEBT-010: the `status <> 'VOIDED'` clause is what keeps every report that
 * joins `sales` directly (productAggregate → productProfit/topProducts, and
 * profitLoss()'s cogsRows) correct after a void, with no separate change
 * needed in those queries — they all go through this one fragment. The
 * REVENUE side (profitLoss()'s moneyRows, incomeByPaymentMethod,
 * dailyIncome's incomeRows) reads `ledger_entries` directly with no join to
 * `sales` at all, so it does NOT self-heal from this change — see the
 * `LEFT JOIN sales` additions in reports.service.ts for that half.
 */
export function saleScope(range: ReportRange, branchId?: string): Prisma.Sql {
  const branch = branchId
    ? Prisma.sql` AND s.branch_id = ${branchId}`
    : Prisma.empty;
  return Prisma.sql`s.sold_at >= ${range.from} AND s.sold_at < ${range.to} AND s.status <> 'VOIDED'${branch}`;
}

/**
 * The WIB calendar day of `le.entry_date`, as `YYYY-MM-DD` text.
 *
 * BOTH conversions are required and neither is redundant. `entry_date` is
 * `TIMESTAMP(3)` WITHOUT time zone holding a UTC instant, so:
 *   1. `AT TIME ZONE 'UTC'`          -> timestamptz, read correctly as UTC
 *   2. `AT TIME ZONE 'Asia/Jakarta'` -> local WIB wall-clock time
 * A single conversion would interpret the stored value as ALREADY being WIB and
 * shift it the wrong way by seven hours (ADR-018, plan §4).
 *
 * `to_char` rather than `::date` alone: a bare `date` comes back as a JS `Date`
 * whose rendering depends on the Node process timezone. Text does not.
 */
export function wibDayOfEntryDate(): Prisma.Sql {
  return Prisma.sql`to_char(((le.entry_date AT TIME ZONE 'UTC') AT TIME ZONE ${REPORT_TIMEZONE})::date, 'YYYY-MM-DD')`;
}

/** The WIB calendar day of `s.sold_at`, as `YYYY-MM-DD` text. Same two-step
 * timezone conversion as wibDayOfEntryDate() and for the same reason. */
export function wibDayOfSoldAt(): Prisma.Sql {
  return Prisma.sql`to_char(((s.sold_at AT TIME ZONE 'UTC') AT TIME ZONE ${REPORT_TIMEZONE})::date, 'YYYY-MM-DD')`;
}
