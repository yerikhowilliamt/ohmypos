import { InvalidReportRangeException } from './errors/invalid-report-range.error';

/** Postgres timezone name. Bound as a query parameter, never concatenated. */
export const REPORT_TIMEZONE = 'Asia/Jakarta';

/** WIB is a fixed UTC+7 offset with no DST. */
export const REPORT_UTC_OFFSET = '+07:00';

/** Caps response size and scan length; 366 covers a leap year. */
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
 * Resolves two inclusive WIB dates into a half-open `[from, to)` UTC range.
 *
 * @throws InvalidReportRangeException on a bad date, reversed range, or too long a span.
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
 * Every WIB day in the range, ascending, as `YYYY-MM-DD`. Independent of the
 * process timezone; do not switch to `toLocaleDateString`.
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

/** The WIB day containing `now`, as `YYYY-MM-DD`. Takes `now` to stay pure. */
export function todayWib(now: Date): string {
  return new Date(now.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);
}
