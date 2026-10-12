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

/**
 * Per-raw-material quantity a sale consumes, sorted ascending by id (the lock
 * order). Each material's exact total is rounded once to 4dp, never per line.
 */
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
