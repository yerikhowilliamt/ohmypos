/**
 * Raw Material schemas (ERD §3, ADR-004, ADR-010, ADR-024).
 *
 * `currentStock` is deliberately excluded from create and update schemas —
 * stock is only ever altered via `StockMovement` inside a transaction under
 * `FOR UPDATE` (ADR-007).
 *
 * ADR-024 splits the single `unit` into two: `unit` is the STOCK/RECIPE base
 * unit everything quantity-shaped is measured in, and `purchaseUnit` is the
 * pack the supplier sells, bridged by `conversionFactor`.
 */
import { z } from 'zod';
import {
  ConversionFactorString,
  QuantityString,
  UnitCostString,
  UuidString,
} from './primitives';

export const CreateRawMaterialSchema = z.object({
  name: z.string().trim().min(1).max(120),
  /**
   * STOCK/RECIPE base unit — ml, gram, pcs. Free text (ERD §3), not an enum.
   * Immutable once the material has stock history; that rule needs a database
   * read, so it lives in RawMaterialsService.update, not here.
   */
  unit: z.string().trim().min(1).max(50),
  /** PURCHASE unit — the pack the supplier sells: ekor, liter, kg, pack. */
  purchaseUnit: z.string().trim().min(1).max(50),
  /** How many `unit` in one `purchaseUnit`. 1 ekor = 10 pcs → "10". */
  conversionFactor: ConversionFactorString.default('1'),
  /** Cost per STOCK unit. Overwritten by the latest purchase (ADR-024). */
  unitCost: UnitCostString,
  lowStockThreshold: QuantityString.default('0'),
});
export type CreateRawMaterial = z.infer<typeof CreateRawMaterialSchema>;

export const UpdateRawMaterialSchema = CreateRawMaterialSchema.partial();
export type UpdateRawMaterial = z.infer<typeof UpdateRawMaterialSchema>;

export const RawMaterialResponseSchema = z.object({
  id: UuidString,
  name: z.string(),
  unit: z.string(),
  purchaseUnit: z.string(),
  conversionFactor: QuantityString,
  unitCost: UnitCostString,
  currentStock: QuantityString,
  lowStockThreshold: QuantityString,
  /**
   * True once any StockMovement references this material. Decided server-side
   * so the form can disable the base-unit field instead of letting the user
   * type a change the API will reject (ADR-024).
   */
  isBaseUnitLocked: z.boolean(),
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
});
export type RawMaterialResponse = z.infer<typeof RawMaterialResponseSchema>;
