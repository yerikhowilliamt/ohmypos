/**
 * Raw Material schemas (ERD §3, ADR-004, ADR-010).
 *
 * `currentStock` is deliberately excluded from create and update schemas —
 * stock is only ever altered via `StockMovement` inside a transaction under
 * `FOR UPDATE` (ADR-007).
 */
import { z } from 'zod';
import { MoneyString, QuantityString, UuidString } from './primitives';

export const CreateRawMaterialSchema = z.object({
  name: z.string().trim().min(1).max(120),
  /** unit — kg, liter, pcs. Free text (ERD §3), not an enum. */
  unit: z.string().trim().min(1).max(50),
  unitCost: MoneyString,
  lowStockThreshold: QuantityString.default('0'),
});
export type CreateRawMaterial = z.infer<typeof CreateRawMaterialSchema>;

export const UpdateRawMaterialSchema = CreateRawMaterialSchema.partial();
export type UpdateRawMaterial = z.infer<typeof UpdateRawMaterialSchema>;

export const RawMaterialResponseSchema = z.object({
  id: UuidString,
  name: z.string(),
  unit: z.string(),
  unitCost: MoneyString,
  currentStock: QuantityString,
  lowStockThreshold: QuantityString,
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
});
export type RawMaterialResponse = z.infer<typeof RawMaterialResponseSchema>;
