import { z } from 'zod';
import { QuantityString, SignedQuantityString, UuidString } from './primitives';
import { StockStatus } from './enums';
import { PeriodResponseSchema } from './period.schema';

/** Dashboard 5 rows, computed at query time. No branch dimension (ADR-004). */
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
