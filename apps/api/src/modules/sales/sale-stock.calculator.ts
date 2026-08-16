/**
 * OhMyPos — sale stock fan-out calculator (ADR-007, ADR-015, ADR-016, plan §10.2).
 *
 * Pure — no Prisma calls, no Nest DI, no database. Turns sale lines into the
 * per-raw-material quantity the sale consumes, and fixes the lock order
 * (ADR-016) by returning entries sorted ascending by rawMaterialId. The sort
 * lives here, not in the service, so the lock order is provable by a unit test
 * with no database.
 *
 * Rounding: sums the EXACT products quantity × recipeItem.quantityUsed across
 * every line that touches a material, then rounds the per-material total ONCE
 * to 4dp HALF_UP — because that total is what gets stored on
 * StockMovement.quantity and subtracted from currentStock. Rounding per line
 * and then summing gives a different, drifting answer; see the spec for a
 * worked example.
 */
import { Prisma } from '../../generated/prisma/client';

export interface SaleStockLineInput {
  quantity: Prisma.Decimal;
  recipeItems: { rawMaterialId: string; quantityUsed: Prisma.Decimal }[];
}

export interface StockRequirement {
  rawMaterialId: string;
  /** Aggregated across every contributing line, rounded to 4dp. */
  quantity: Prisma.Decimal;
}

export function aggregateStockRequirements(
  lines: SaleStockLineInput[],
): StockRequirement[] {
  const exactTotals = new Map<string, Prisma.Decimal>();

  for (const line of lines) {
    for (const recipeItem of line.recipeItems) {
      const contribution = line.quantity.times(recipeItem.quantityUsed);
      const running =
        exactTotals.get(recipeItem.rawMaterialId) ?? new Prisma.Decimal(0);
      exactTotals.set(recipeItem.rawMaterialId, running.plus(contribution));
    }
  }

  return Array.from(exactTotals.entries())
    .map(([rawMaterialId, exactQuantity]) => ({
      rawMaterialId,
      quantity: exactQuantity.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP),
    }))
    .sort((a, b) => a.rawMaterialId.localeCompare(b.rawMaterialId));
}
