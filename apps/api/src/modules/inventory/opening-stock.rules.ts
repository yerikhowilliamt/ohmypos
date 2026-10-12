import { Prisma } from '../../generated/prisma/client';
import type { OpeningDelta } from './opening-stock.calculator';
import {
  OpeningStockUnitPriceNotAllowedException,
  OpeningStockUnitPriceRequiredException,
  OpeningStockWouldGoNegativeException,
} from './inventory.exceptions';

export interface UnitPriceRuleEntry {
  rawMaterialId: string;
  name: string;
  unitPrice?: string;
}

/**
 * Requires a unit price for materials with no purchase this period, and rejects
 * one for materials that have a purchase (PRD §5.5).
 *
 * @throws OpeningStockUnitPriceRequiredException
 * @throws OpeningStockUnitPriceNotAllowedException
 */
export function assertUnitPriceRule(
  entries: UnitPriceRuleEntry[],
  materialIdsWithPurchaseInPeriod: Set<string>,
): void {
  const missing = entries.filter(
    (entry) =>
      entry.unitPrice === undefined &&
      !materialIdsWithPurchaseInPeriod.has(entry.rawMaterialId),
  );
  if (missing.length > 0) {
    throw new OpeningStockUnitPriceRequiredException(
      missing.map((entry) => entry.name),
    );
  }

  const forbidden = entries.filter(
    (entry) =>
      entry.unitPrice !== undefined &&
      materialIdsWithPurchaseInPeriod.has(entry.rawMaterialId),
  );
  if (forbidden.length > 0) {
    throw new OpeningStockUnitPriceNotAllowedException(
      forbidden.map((entry) => entry.name),
    );
  }
}

/**
 * Rejects declarations whose resulting stock would be negative, listing every
 * offender at once.
 *
 * @throws OpeningStockWouldGoNegativeException
 */
export function assertOpeningStockNotNegative(
  deltas: OpeningDelta[],
  nameById: Map<string, string>,
): void {
  const offenders = deltas.filter((delta) => delta.resultingStock.isNegative());

  if (offenders.length > 0) {
    throw new OpeningStockWouldGoNegativeException(
      offenders.map((offender) => ({
        name: nameById.get(offender.rawMaterialId) ?? offender.rawMaterialId,
        delta: offender.delta,
        resultingStock: offender.resultingStock,
      })),
    );
  }
}

/** Parses a decimal string into `Prisma.Decimal`. */
export function toDecimal(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}
