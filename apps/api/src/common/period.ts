/**
 * OhMyPos — report period resolution (ADR-018, PRD §5.4).
 *
 * THE single definition of "what calendar range does this report cover" for the
 * whole repository. Phase 6's Inventory Summary must import from here rather
 * than writing its own month resolver — two definitions would make Dashboard 3
 * and Dashboard 5 disagree by seven hours at every boundary.
 *
 * Pure: no Prisma, no Nest DI, no `Date.now()`. Unit-tested with no database
 * (same shape as modules/sales/sale-totals.ts).
 *
 * Storage is UNAFFECTED: soldAt / entryDate / movementDate remain UTC instants
 * serialized with toISOString(). Only report BOUNDARIES and BUCKETS are WIB.
 */
import { InvalidReportRangeException } from './errors/invalid-report-range.error';

/** Postgres timezone name. Bound as a query parameter, never concatenated. */
export const REPORT_TIMEZONE = 'Asia/Jakarta';

/** WIB is a fixed UTC+7 offset with no DST — no ambiguous or skipped local times. */
export const REPORT_UTC_OFFSET = '+07:00';

/**
 * A daily-income response carries one row per day, so an unbounded range is an
 * unbounded response and an unbounded scan. 366 covers a full leap year.
 */
export const MAX_REPORT_RANGE_DAYS = 366;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;
const MS_PER_HOUR = 3_600_000;
export const WIB_OFFSET_MS = 7 * MS_PER_HOUR;

export interface ReportRange {
  /** `YYYY-MM-DD`, WIB, inclusive — echoed back on the response. */
  startDate: string;
  /** `YYYY-MM-DD`, WIB, inclusive. */
  endDate: string;
  /** UTC instant, INCLUSIVE lower bound. */
  from: Date;
  /** UTC instant, EXCLUSIVE upper bound. */
  to: Date;
  /** Number of WIB calendar days covered. Exact — WIB has no DST. */
  dayCount: number;
}

/** `2025-03-05` -> the instant of 2025-03-05T00:00:00.000+07:00. */
function wibMidnight(isoDate: string): Date {
  if (!DATE_PATTERN.test(isoDate)) {
    throw new InvalidReportRangeException(
      `Tanggal "${isoDate}" tidak dikenali. Gunakan format YYYY-MM-DD.`,
    );
  }
  const instant = new Date(`${isoDate}T00:00:00.000${REPORT_UTC_OFFSET}`);
  if (Number.isNaN(instant.getTime())) {
    throw new InvalidReportRangeException(
      `Tanggal "${isoDate}" tidak ada dalam kalender.`,
    );
  }
  const utcMidnightOfWib = new Date(instant.getTime() + WIB_OFFSET_MS);
  if (utcMidnightOfWib.toISOString().slice(0, 10) !== isoDate) {
    throw new InvalidReportRangeException(
      `Tanggal "${isoDate}" tidak ada dalam kalender.`,
    );
  }
  return instant;
}

/**
 * Resolves two INCLUSIVE WIB calendar dates into a half-open UTC instant range.
 * The upper bound is exclusive so a sale at 23:59:59.999 on the end day is
 * inside the range and one at 00:00:00.000 the next day is not.
 */
export function resolveReportRange(
  startDate: string,
  endDate: string,
): ReportRange {
  const from = wibMidnight(startDate);
  // +1 day: `endDate` is inclusive, the bound is exclusive.
  const to = new Date(wibMidnight(endDate).getTime() + MS_PER_DAY);

  if (to.getTime() <= from.getTime()) {
    throw new InvalidReportRangeException(
      `endDate ${endDate} precedes startDate ${startDate}`,
    );
  }

  const dayCount = Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
  if (dayCount > MAX_REPORT_RANGE_DAYS) {
    throw new InvalidReportRangeException(
      `Rentang tanggal ${dayCount} hari terlalu panjang. Maksimal ${MAX_REPORT_RANGE_DAYS} hari — persempit rentangnya.`,
    );
  }

  return { startDate, endDate, from, to, dayCount };
}

/**
 * Every WIB calendar day in the range, ascending, as `YYYY-MM-DD`.
 *
 * `from` is WIB midnight = 17:00 UTC on the previous day; adding 7h lands on
 * UTC midnight of the same WIB day, so `toISOString().slice(0, 10)` yields the
 * WIB date regardless of the Node process timezone. Do not replace this with
 * `toLocaleDateString` — that reintroduces the process-timezone dependency.
 */
export function eachWibDay(range: ReportRange): string[] {
  const days: string[] = [];
  for (let i = 0; i < range.dayCount; i += 1) {
    const utcMidnightOfWibDay = new Date(
      range.from.getTime() + i * MS_PER_DAY + WIB_OFFSET_MS,
    );
    days.push(utcMidnightOfWibDay.toISOString().slice(0, 10));
  }
  return days;
}

/**
 * The WIB calendar day containing `now`, as `YYYY-MM-DD`.
 *
 * `now` is a parameter, not `Date.now()` — this file stays pure/testable (see
 * file header). Callers needing "today" pass `new Date()` explicitly; this
 * function must never call `Date.now()` itself.
 */
export function todayWib(now: Date): string {
  return new Date(now.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);
}
