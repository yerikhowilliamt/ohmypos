import { Prisma } from '../../generated/prisma/client';
import { InsufficientStockException } from './stock-movements.exceptions';

export interface StockSufficiencyRequirement {
  rawMaterialId: string;
  name: string;
  quantity: Prisma.Decimal;
}

/**
 * Throws if any requirement exceeds its available quantity, listing every
 * shortfall at once.
 *
 * A material missing from `available` is treated as zero stock (fail closed).
 *
 * @throws InsufficientStockException
 */
export function assertSufficientStock(
  required: StockSufficiencyRequirement[],
  available: Map<string, Prisma.Decimal>,
): void {
  const shortfalls = required
    .map((r) => ({
      ...r,
      availableQuantity:
        available.get(r.rawMaterialId) ?? new Prisma.Decimal(0),
    }))
    .filter((r) => r.availableQuantity.lessThan(r.quantity));

  if (shortfalls.length > 0) {
    throw new InsufficientStockException(
      shortfalls.map((s) => ({
        rawMaterialId: s.rawMaterialId,
        name: s.name,
        required: s.quantity,
        available: s.availableQuantity,
      })),
    );
  }
}
