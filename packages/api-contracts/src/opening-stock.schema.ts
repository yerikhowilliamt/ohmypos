import { z } from 'zod';
import {
  DateTimeString,
  QuantityString,
  SignedQuantityString,
  UnitCostString,
  UuidString,
} from './primitives';
import { PeriodMonthString, PeriodResponseSchema } from './period.schema';

export const OpeningStockEntryInputSchema = z.object({
  rawMaterialId: UuidString,
  /** The physical count at the start of the period, not a delta. Zero is valid. */
  quantity: QuantityString,
  /** Required iff the material has no purchase this period, forbidden otherwise (PRD §5.5). */
  unitPrice: UnitCostString.optional(),
});
export type OpeningStockEntryInput = z.infer<
  typeof OpeningStockEntryInputSchema
>;

export const UpsertOpeningStockSchema = z
  .object({
    periodMonth: PeriodMonthString,
    /** At most 200 entries, to bound the lock-holding transaction (ADR-016). */
    entries: z.array(OpeningStockEntryInputSchema).min(1).max(200),
  })
  .superRefine((dto, ctx) => {
    // One declaration per material per period.
    const seen = new Set<string>();
    dto.entries.forEach((entry, index) => {
      if (seen.has(entry.rawMaterialId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['entries', index, 'rawMaterialId'],
          message:
            'Bahan baku yang sama tercantum dua kali. Gabungkan menjadi satu baris.',
        });
      }
      seen.add(entry.rawMaterialId);
    });
  });
export type UpsertOpeningStock = z.infer<typeof UpsertOpeningStockSchema>;

export const OpeningStockResponseSchema = z.object({
  id: UuidString,
  rawMaterialId: UuidString,
  rawMaterialName: z.string(),
  /** The stored `@db.Date`, serialized as `YYYY-MM-01`. */
  periodMonth: z.string(),
  quantity: QuantityString,
  unitPrice: UnitCostString.nullable(),
  /** The signed correction written to the ledger. */
  appliedDelta: SignedQuantityString,
  createdAt: DateTimeString,
  updatedAt: DateTimeString,
});
export type OpeningStockResponse = z.infer<typeof OpeningStockResponseSchema>;

export const UpsertOpeningStockResponseSchema = z.object({
  period: PeriodResponseSchema,
  data: z.array(OpeningStockResponseSchema),
});
export type UpsertOpeningStockResponse = z.infer<
  typeof UpsertOpeningStockResponseSchema
>;

/** One worksheet row per raw material, declared or not. */
export const OpeningStockWorksheetRowSchema = z.object({
  rawMaterialId: UuidString,
  name: z.string(),
  /** The STOCK unit — what this row's quantity is counted in (ADR-024). */
  unit: z.string(),
  /** What the movement ledger carried into the period, before any declaration. */
  carryForwardQuantity: SignedQuantityString,
  /** null when this material has not been declared for this period yet. */
  declaredQuantity: QuantityString.nullable(),
  /** Same 6dp scale as `currentUnitCost` — it is the price that was declared FOR this row (ADR-024). */
  declaredUnitPrice: UnitCostString.nullable(),
  /** The PRD §5.5 rule, decided server-side — do not recompute it client-side. */
  requiresUnitPrice: z.boolean(),
  /** RawMaterial.unitCost, so the form can prefill the price field. */
  currentUnitCost: UnitCostString,
  /** Display only (ADR-024): counts are always in `unit`. */
  purchaseUnit: z.string(),
  conversionFactor: QuantityString,
});
export type OpeningStockWorksheetRow = z.infer<
  typeof OpeningStockWorksheetRowSchema
>;

export const OpeningStockWorksheetResponseSchema = z.object({
  period: PeriodResponseSchema,
  data: z.array(OpeningStockWorksheetRowSchema),
});
export type OpeningStockWorksheetResponse = z.infer<
  typeof OpeningStockWorksheetResponseSchema
>;
