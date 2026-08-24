/**
 * OhMyPos — calendar-period resolution (Phase 6 plan §9, ADR-023).
 *
 * Pure — no Prisma, no Nest DI, no database. A period is a calendar month in
 * Asia/Jakarta (WIB): `periodStart` inclusive, `periodEnd` EXCLUSIVE.
 *
 * Delegates to `common/period.ts` (ADR-018) rather than deriving its own UTC
 * boundary — ADR-023 extends ADR-018's WIB decision to inventory after Phase
 * 14 found the two definitions disagreeing by seven hours at every month
 * boundary (a sale in the last WIB hour of a month landed in next month's
 * report but this month's inventory). `common/period.ts` is now the ONLY
 * place a calendar-month boundary is computed.
 */
import { resolveReportRange } from '../../common/period';
import {
  FuturePeriodNotAllowedException,
  InvalidPeriodException,
} from './inventory.exceptions';

export interface Period {
  /** `YYYY-MM`, exactly as supplied. */
  month: string;
  /** Inclusive lower bound (WIB midnight of the 1st) — for StockMovement range queries. */
  periodStart: Date;
  /** EXCLUSIVE upper bound (WIB midnight of the 1st of next month). */
  periodEnd: Date;
  /**
   * UTC midnight of the 1st — for `OpeningStock.periodMonth` (`@db.Date`) ONLY.
   *
   * Deliberately NOT `periodStart`: a `@db.Date` column stores whatever
   * calendar date the driver derives from the JS Date it's given, and
   * `periodStart` is now a WIB instant (2026-06-30T17:00:00.000Z for "July"),
   * which truncates to 2026-06-30 — one day earlier than every row written
   * before ADR-023. Keeping this field on the pre-ADR-023 UTC-midnight value
   * means existing OpeningStock rows keep matching their unique key
   * (rawMaterialId, periodMonth) with no data migration required.
   */
  periodMonthDate: Date;
}

const PERIOD_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** The number of calendar days in `year`-`month` (`month` is 1-indexed). */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * `'2026-08'` → the WIB instant range covering every day of August 2026.
 *
 * Zod (`PeriodMonthString`) already rejects a malformed period at the
 * controller boundary; this throw is the defence for any future caller that
 * reaches the service directly.
 */
export function parsePeriodMonth(period: string): Period {
  const match = PERIOD_PATTERN.exec(period);
  if (!match) {
    throw new InvalidPeriodException(period);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const lastDay = daysInMonth(year, month);

  const startDate = `${period}-01`;
  const endDate = `${period}-${String(lastDay).padStart(2, '0')}`;
  const range = resolveReportRange(startDate, endDate);

  return {
    month: period,
    periodStart: range.from,
    periodEnd: range.to,
    periodMonthDate: new Date(Date.UTC(year, month - 1, 1)),
  };
}

/**
 * Rejects a period that has not started yet. A mistyped year would otherwise
 * write an OPENING movement dated decades ahead: it counts into currentStock
 * immediately (currentStock is a running total, not a dated one) while
 * appearing in no report anyone looks at.
 */
export function assertPeriodHasStarted(period: Period, now: Date): void {
  if (period.periodStart.getTime() > now.getTime()) {
    throw new FuturePeriodNotAllowedException(period.month);
  }
}

/** A Date → `'YYYY-MM'`. Used on the stored `@db.Date` column. */
export function formatPeriodMonth(date: Date): string {
  return date.toISOString().slice(0, 7);
}

/** A Date → `'YYYY-MM-DD'`. Used to serialize `OpeningStock.periodMonth`. */
export function formatPeriodDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
