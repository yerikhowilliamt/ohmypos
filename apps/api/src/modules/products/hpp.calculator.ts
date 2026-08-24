/**
 * OhMyPos — HPP calculator (ADR-005, ADR-013, ERD §3).
 *
 * Pure function — no Prisma database calls, no Nest DI. Phase 5 reuses this exact
 * function for `SaleItem.hppAtSale` (ADR-005); the live master data figure and
 * the snapshot must never be two implementations that can drift.
 */
import { Prisma } from '../../generated/prisma/client';

export interface HppLineInput {
  quantityUsed: Prisma.Decimal;
  unitCost: Prisma.Decimal;
}

/**
 * Calculates live HPP from recipe items.
 *
 * Returns `null` when `items` is empty — "no recipe" is a different fact than
 * "recipe costs nothing," and callers must not treat `null` as 0 (ADR-013).
 */
export function calculateHpp(items: HppLineInput[]): Prisma.Decimal | null {
  if (items.length === 0) return null;

  const total = items.reduce(
    (sum, item) => sum.plus(item.quantityUsed.times(item.unitCost)),
    new Prisma.Decimal(0),
  );

  // Round once, HALF_UP — rounding per line item would make HPP depend on how a
  // recipe happened to be split into rows (§9.1, ADR-013).
  return total.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
