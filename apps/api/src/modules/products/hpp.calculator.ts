import { Prisma } from '../../generated/prisma/client';

export interface HppLineInput {
  quantityUsed: Prisma.Decimal;
  unitCost: Prisma.Decimal;
}

/**
 * Recipe cost before waste, Σ(quantityUsed × unitCost), unrounded. Returns
 * `null` for an empty recipe, which callers must never treat as 0 (ADR-013).
 */
export function calculateBaseHpp(items: HppLineInput[]): Prisma.Decimal | null {
  if (items.length === 0) return null;

  return items.reduce(
    (sum, item) => sum.plus(item.quantityUsed.times(item.unitCost)),
    new Prisma.Decimal(0),
  );
}

/**
 * Live HPP: `round2(Σ(quantityUsed × unitCost) × (1 + wastePercent / 100))`.
 *
 * The live product figure and `SaleItem.hppAtSale` must both use this function
 * and both pass `wastePercent` (ADR-005, ADR-024). Waste never changes stock
 * deduction. Returns `null` for an empty recipe (ADR-013).
 */
export function calculateHpp(
  items: HppLineInput[],
  wastePercent: Prisma.Decimal = new Prisma.Decimal(0),
): Prisma.Decimal | null {
  const base = calculateBaseHpp(items);
  if (base === null) return null;

  const withWaste = base.times(
    new Prisma.Decimal(1).plus(wastePercent.dividedBy(100)),
  );

  // Round once, at the end: never per line, never before applying waste.
  return withWaste.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
