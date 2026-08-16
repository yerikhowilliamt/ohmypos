/**
 * OhMyPos — sale-time stock sufficiency rule (ADR-007, plan §10.2).
 *
 * Pure — no database, no Nest DI (same shape as payables/payables.rules.ts).
 * Playbook §10 puts the Sale flow in the "must have thorough tests" tier;
 * keeping the rule pure is what makes the exhaustive cases fast and isolated.
 *
 * Checks EVERY requirement before throwing, so the exception names every short
 * material at once — a cashier fixing an order needs the whole list, not just
 * the first failure.
 */
import { Prisma } from '../../generated/prisma/client';
import { InsufficientStockException } from './stock-movements.exceptions';

export interface StockSufficiencyRequirement {
  rawMaterialId: string;
  name: string;
  quantity: Prisma.Decimal;
}

export function assertSufficientStock(
  required: StockSufficiencyRequirement[],
  available: Map<string, Prisma.Decimal>,
): void {
  const shortfalls = required
    .map((r) => ({
      ...r,
      // A material absent from `available` is a shortfall, not a skip — failing
      // open here would let a sale consume a material that no longer exists.
      availableQuantity:
        available.get(r.rawMaterialId) ?? new Prisma.Decimal(0),
    }))
    .filter((r) => r.availableQuantity.lessThan(r.quantity));

  if (shortfalls.length > 0) {
    throw new InsufficientStockException(
      shortfalls.map((s) => ({
        name: s.name,
        required: s.quantity,
        available: s.availableQuantity,
      })),
    );
  }
}
