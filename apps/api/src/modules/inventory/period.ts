/**
 * OhMyPos — calendar-period resolution (Phase 6 plan §9).
 *
 * Pure — no Prisma, no Nest DI, no database. A period is a calendar month in
 * UTC: `periodStart` inclusive, `periodEnd` EXCLUSIVE. UTC is not an oversight,
 * it is consistency — every other date in this repo (soldAt, purchaseDate,
 * entryDate, movementDate) is stored and compared as supplied, with no offset
 * logic anywhere. Applying a WIB offset here and nowhere else would make
 * Dashboard 5 disagree with Dashboard 3 at every month boundary (DEBT-012).
 *
 * Phase 7's reports take the same parameter and must import from this file
 * rather than re-deriving a month boundary of their own.
 */
import {
  FuturePeriodNotAllowedException,
  InvalidPeriodException,
} from './inventory.exceptions';

export interface Period {
  /** `YYYY-MM`, exactly as supplied. */
  month: string;
  /** Inclusive lower bound. */
  periodStart: Date;
  /** EXCLUSIVE upper bound — the first instant of the next month. */
  periodEnd: Date;
}

const PERIOD_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

/**
 * `'2026-08'` → 2026-08-01T00:00:00.000Z … 2026-09-01T00:00:00.000Z.
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

  return {
    month: period,
    periodStart: new Date(Date.UTC(year, month - 1, 1)),
    // Date.UTC(2026, 12, 1) is 2027-01-01 — December rolls over on its own, so
    // there is no year-end special case to get wrong.
    periodEnd: new Date(Date.UTC(year, month, 1)),
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
