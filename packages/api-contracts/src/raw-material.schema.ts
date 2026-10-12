import { z } from 'zod';
import {
  ConversionFactorString,
  QuantityString,
  UnitCostString,
  UuidString,
} from './primitives';

export const CreateRawMaterialSchema = z.object({
  name: z.string().trim().min(1).max(120),
  /** Stock/recipe base unit. Immutable once stock history exists (checked server-side). */
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
  /** True once any stock movement exists; the form disables `unit` (ADR-024). */
  isBaseUnitLocked: z.boolean(),
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
});
export type RawMaterialResponse = z.infer<typeof RawMaterialResponseSchema>;
