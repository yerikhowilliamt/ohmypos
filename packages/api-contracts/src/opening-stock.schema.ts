import { z } from 'zod';
import {
  DateTimeString,
  MoneyString,
  QuantityString,
  SignedQuantityString,
  UuidString,
} from './primitives';
import { PeriodMonthString, PeriodResponseSchema } from './period.schema';

/**
 * OhMyPos — OpeningStock contracts (PRD §5.5, ERD §3, System Design §6.4,
 * ADR-004, ADR-010, Phase 6 plan §3, §5, §7).
 */
export const OpeningStockEntryInputSchema = z.object({
  rawMaterialId: UuidString,
  /**
   * The declared physical count at the START of the period — NOT a delta and
   * NOT an amount to add. The server derives the ledger movement by subtracting
   * what the ledger already carried in (plan §3.2). Zero is legal: "we counted,
   * there was none".
   */
  quantity: QuantityString,
  /**
   * Required IFF no PURCHASE movement exists for this material in this period
   * (PRD §5.5, plan §5). Both directions are enforced server-side — omitting it
   * when required is a 400, and supplying it when a purchase already priced the
   * material is also a 400. `GET /inventory/opening-stock` exposes
   * `requiresUnitPrice` per material so the form never has to guess.
   */
  unitPrice: MoneyString.optional(),
});
export type OpeningStockEntryInput = z.infer<
  typeof OpeningStockEntryInputSchema
>;

export const UpsertOpeningStockSchema = z
  .object({
    periodMonth: PeriodMonthString,
    /**
     * Bounded at 200. Every entry adds round trips inside a transaction that
     * holds raw-material row locks (ADR-016), and the bound is what keeps the
     * lock-hold window and the transaction timeout predictable — the same
     * reasoning as CreateSaleSchema's 50-line bound.
     */
    entries: z.array(OpeningStockEntryInputSchema).min(1).max(200),
  })
  .superRefine((dto, ctx) => {
    // One declaration per material per period. Unlike a sale line (where the
    // same product may legitimately appear twice at two prices), two
    // declarations for one material in one period are unambiguously a client
    // bug — and the second would silently win the upsert.
    const seen = new Set<string>();
    dto.entries.forEach((entry, index) => {
      if (seen.has(entry.rawMaterialId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['entries', index, 'rawMaterialId'],
          message: 'duplicate rawMaterialId in the same period',
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
  unitPrice: MoneyString.nullable(),
  /**
   * The SIGNED movement this declaration wrote to the ledger — negative when
   * the count came in below what the ledger carried. Returned so the caller can
   * see what the stock-take actually corrected, which is the one number the
   * request body does not contain (plan §3.2).
   */
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

/**
 * One row per raw material, declared or not — this is what the Phase 8e screen
 * renders as an editable table.
 */
export const OpeningStockWorksheetRowSchema = z.object({
  rawMaterialId: UuidString,
  name: z.string(),
  unit: z.string(),
  /** What the movement ledger carried into the period, before any declaration. */
  carryForwardQuantity: SignedQuantityString,
  /** null when this material has not been declared for this period yet. */
  declaredQuantity: QuantityString.nullable(),
  declaredUnitPrice: MoneyString.nullable(),
  /** The PRD §5.5 rule, decided server-side — do not recompute it client-side. */
  requiresUnitPrice: z.boolean(),
  /** RawMaterial.unitCost, so the form can prefill the price field. */
  currentUnitCost: MoneyString,
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
