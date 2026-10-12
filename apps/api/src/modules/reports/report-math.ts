import { Prisma } from '../../generated/prisma/client';

/** `SUM(...)` over an empty set is SQL NULL; every aggregate passes through here. */
export function nullToZero(value: Prisma.Decimal | null): Prisma.Decimal {
  return value ?? new Prisma.Decimal(0);
}

/** A percentage to 2dp (HALF_UP), or `null` when the denominator is zero. */
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

/** Average over every day in the range, not only days with income. */
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
  cogs: Prisma.Decimal;
  operatingExpenses: Prisma.Decimal;
}

/** One bucket per day in `days`, in order, zero-filled where `present` has none. */
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
        cogs: new Prisma.Decimal(0),
        operatingExpenses: new Prisma.Decimal(0),
      },
  );
}

/** Sums a list of decimals. */
export function sumDecimals(values: Prisma.Decimal[]): Prisma.Decimal {
  return values.reduce((sum, v) => sum.plus(v), new Prisma.Decimal(0));
}
