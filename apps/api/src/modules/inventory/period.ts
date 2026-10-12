import { resolveReportRange } from '../../common/period';
import {
  FuturePeriodNotAllowedException,
  InvalidPeriodException,
} from './inventory.exceptions';

export interface Period {
  /** `YYYY-MM`, exactly as supplied. */
  month: string;
  /** Inclusive lower bound: WIB midnight of the 1st. */
  periodStart: Date;
  /** Exclusive upper bound: WIB midnight of the 1st of next month. */
  periodEnd: Date;
  /**
   * UTC midnight of the 1st. Use only for `OpeningStock.periodMonth` (`@db.Date`);
   * `periodStart` would truncate to the previous day.
   */
  periodMonthDate: Date;
}

const PERIOD_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** The number of calendar days in `year`-`month` (`month` is 1-indexed). */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Resolves `'YYYY-MM'` to the WIB instant range covering that calendar month.
 *
 * @throws InvalidPeriodException on a malformed period.
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
 * @throws FuturePeriodNotAllowedException if the period has not started yet.
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
