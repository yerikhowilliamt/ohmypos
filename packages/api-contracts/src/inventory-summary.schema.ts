import { z } from 'zod';
import { QuantityString, SignedQuantityString, UuidString } from './primitives';
import { StockStatus } from './enums';
import { PeriodResponseSchema } from './period.schema';

/**
 * OhMyPos — Inventory Summary contracts (PRD §5.6 "Dashboard 5", ADR-004,
 * ADR-008, ADR-010, Phase 6 plan §2, §7.3).
 *
 * Read-only and computed at query time — there is deliberately no create,
 * update, or "recalculate" shape here. Every number is derived from
 * StockMovement on each request (ADR-008); nothing about closing stock is
 * stored, so nothing about it can drift.
 *
 * There is also deliberately NO branchId anywhere in this file. Stock is a
 * single centralized pool (ADR-004) and `StockMovement.branchId` is attribution
 * only, so a branch-filtered opening balance does not exist (plan §7.4).
 */
export const InventorySummaryRowSchema = z.object({
  rawMaterialId: UuidString,
  name: z.string(),
  unit: z.string(),
  /** Signed: a closing balance is a computed difference, not an amount. */
  openingQuantity: SignedQuantityString,
  inQuantity: QuantityString,
  outQuantity: QuantityString,
  closingQuantity: SignedQuantityString,
  lowStockThreshold: QuantityString,
  status: StockStatus,
});
export type InventorySummaryRow = z.infer<typeof InventorySummaryRowSchema>;

export const InventorySummaryResponseSchema = z.object({
  period: PeriodResponseSchema,
  data: z.array(InventorySummaryRowSchema),
});
export type InventorySummaryResponse = z.infer<
  typeof InventorySummaryResponseSchema
>;
