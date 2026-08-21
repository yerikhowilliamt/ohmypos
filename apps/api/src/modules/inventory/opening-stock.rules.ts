/**
 * OhMyPos — opening-stock validation rules (PRD §5.5, Phase 6 plan §5, §3.4).
 *
 * Pure — no Prisma client, no Nest DI, no database (same shape as
 * stock.rules.ts and payables.rules.ts).
 *
 * Both rules check EVERY entry before throwing, so one request tells the user
 * about every problem at once. A stock-take is a form with dozens of rows;
 * fixing them one 400 at a time is not a workflow.
 */
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
 * PRD §5.5: the unit price is recorded "if no purchase has been made yet that
 * month". Enforced in BOTH directions — a price supplied when a purchase has
 * already priced the material is not harmlessly ignored, it is rejected, because
 * silently discarding a number the user typed is how a valuation nobody
 * intended ends up on the movement.
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
 * A declaration below what the period has already consumed would drive the
 * centralized pool negative (plan §3.4). Checked for every entry BEFORE any
 * movement is written, so the rejection is all-then-none independently of the
 * transaction rollback — two mechanisms delivering the same guarantee, exactly
 * as applyOutbound does for sales.
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

/** Narrow helper so services never build a Decimal inline (Playbook §5). */
export function toDecimal(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}
