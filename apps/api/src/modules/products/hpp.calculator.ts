/**
 * OhMyPos — HPP calculator (ADR-005, ADR-013, ERD §3).
 *
 * Pure function — no Prisma database calls, no Nest DI. `SaleItem.hppAtSale`
 * uses this exact function (ADR-005); the live master data figure and the
 * snapshot must never be two implementations that can drift.
 */
import { Prisma } from '../../generated/prisma/client';

export interface HppLineInput {
  quantityUsed: Prisma.Decimal;
  unitCost: Prisma.Decimal;
}

/**
 * The recipe sum BEFORE any waste allowance — Σ(quantityUsed × unitCost),
 * unrounded.
 *
 * Exposed separately because two callers need the pre-waste figure: the recipe
 * editor shows it as the subtotal its line costs add up to, and `calculateHpp`
 * needs it unrounded so the waste multiplication happens before the single
 * rounding step.
 *
 * Returns `null` when `items` is empty — "no recipe" is a different fact than
 * "recipe costs nothing," and callers must not treat `null` as 0 (ADR-013).
 */
export function calculateBaseHpp(items: HppLineInput[]): Prisma.Decimal | null {
  if (items.length === 0) return null;

  return items.reduce(
    (sum, item) => sum.plus(item.quantityUsed.times(item.unitCost)),
    new Prisma.Decimal(0),
  );
}

/**
 * Calculates live HPP from recipe items, including the product's waste
 * allowance (ADR-005, ADR-024).
 *
 *   hpp = round2(Σ(quantityUsed × unitCost) × (1 + wastePercent / 100))
 *
 * `wastePercent` defaults to zero so every pre-ADR-024 call site keeps its
 * exact previous behaviour; the two call sites that matter — the live product
 * figure and the `SaleItem.hppAtSale` snapshot — pass it explicitly, and must
 * both keep doing so or the two will drift, which is the failure ADR-005 exists
 * to prevent.
 *
 * Waste is an HPP allowance ONLY: it never changes how much stock a sale
 * deducts. `RecipeItem.quantityUsed` is untouched by this function.
 *
 * Returns `null` when `items` is empty (ADR-013) — a waste percentage on a
 * product with no recipe is still "no recipe", not zero cost.
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

  // Round ONCE, HALF_UP, and only here — rounding per line item would make HPP
  // depend on how a recipe happened to be split into rows, and rounding the
  // base before applying waste would do the same thing one step later
  // (§9.1, ADR-013, ADR-024).
  return withWaste.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
