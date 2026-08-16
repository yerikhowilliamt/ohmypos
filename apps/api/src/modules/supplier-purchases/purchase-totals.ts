/**
 * OhMyPos — Pure Purchase Totals Calculator (ERD §3, plan §9.3).
 *
 * Pure — no Prisma database calls, no Nest DI (same pattern as products/hpp.calculator.ts).
 *
 * Rounding rule, and why it DIFFERS from calculateHpp: `lineTotal` is a STORED
 * Decimal(18,2) column, so each line must be rounded to 2dp before it is
 * persisted, and `totalAmount` must equal the sum of the values actually stored.
 * calculateHpp rounds once at the end because nothing intermediate is stored
 * there. Do not "harmonise" these two rules — they are answering different
 * questions. (ADR-005 vs. ERD §3.)
 */
import { Prisma } from '../../generated/prisma/client';

export interface PurchaseLineInput {
  quantity: Prisma.Decimal;
  unitCost: Prisma.Decimal;
}

export function calculateLineTotal(line: PurchaseLineInput): Prisma.Decimal {
  return line.quantity
    .times(line.unitCost)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/** Sum of the ALREADY-ROUNDED line totals — see the rounding note above. */
export function calculatePurchaseTotal(
  lineTotals: Prisma.Decimal[],
): Prisma.Decimal {
  return lineTotals
    .reduce((sum, lt) => sum.plus(lt), new Prisma.Decimal(0))
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
