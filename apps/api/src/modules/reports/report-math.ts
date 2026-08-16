/**
 * OhMyPos — pure derivations for Dashboard 3 (plan §6.7).
 *
 * Everything here is arithmetic on values the database already summed. It is
 * separated from the service so the divide-by-zero rule, the rounding rule and
 * the gap-fill rule are unit-testable with no database (same shape as
 * modules/sales/sale-totals.ts).
 *
 * Rounding rule (plan §2): every reported figure is rounded ONCE, from exact
 * inputs, HALF_UP — matching calculateTotalHpp, not calculateSaleTotal. Nothing
 * here is a stored column, so there is nothing to round per row first.
 */
import { Prisma } from '../../generated/prisma/client';

/** `SUM(...)` over an empty set is SQL NULL; every aggregate passes through here. */
export function nullToZero(value: Prisma.Decimal | null): Prisma.Decimal {
  return value ?? new Prisma.Decimal(0);
}

/**
 * A percentage to 2dp, or `null` when the denominator is zero.
 *
 * `null`, never NaN and never Infinity: zero revenue is reachable (a fully
 * discounted line is legal, PRD §5.2) and a JSON body containing NaN is not
 * valid JSON.
 */
export function percentageOf(
  numerator: Prisma.Decimal,
  denominator: Prisma.Decimal,
): number | null {
  if (denominator.isZero()) return null;
  return numerator
    .dividedBy(denominator)
    .times(100)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
    .toNumber();
}

/**
 * Divides by the number of days IN THE RANGE, not by the number of days that
 * happened to have income — that is the whole reason the response is gap-filled.
 */
export function averagePerDay(
  total: Prisma.Decimal,
  dayCount: number,
): Prisma.Decimal {
  if (dayCount <= 0) return new Prisma.Decimal(0);
  return total
    .dividedBy(dayCount)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export interface DailyIncomeBucket {
  date: string;
  income: Prisma.Decimal;
  entryCount: number;
}

/**
 * Returns one bucket per day in `days`, in that order, taking values from
 * `present` where they exist and zero elsewhere.
 *
 * Done in TypeScript rather than SQL `generate_series` so it is unit-testable
 * with no database. The range is already bounded to MAX_REPORT_RANGE_DAYS, so
 * the array cannot grow without limit.
 */
export function fillDailyGaps(
  days: string[],
  present: DailyIncomeBucket[],
): DailyIncomeBucket[] {
  const byDate = new Map(present.map((row) => [row.date, row]));
  return days.map(
    (date) =>
      byDate.get(date) ?? {
        date,
        income: new Prisma.Decimal(0),
        entryCount: 0,
      },
  );
}

/** Sums already-summed per-row totals — used for the product-profit totals block. */
export function sumDecimals(values: Prisma.Decimal[]): Prisma.Decimal {
  return values.reduce((sum, v) => sum.plus(v), new Prisma.Decimal(0));
}
