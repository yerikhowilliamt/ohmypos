import { z } from 'zod';
import {
  MoneyString,
  QuantityString,
  UuidString,
  WastePercentString,
} from './primitives';

export const CreateProductSchema = z.object({
  name: z.string().trim().min(1).max(120),
  sellPrice: MoneyString,
  /** Waste allowance, 0–100%. Affects HPP only, never stock (ADR-024). Defaults to 0. */
  wastePercent: WastePercentString.default('0'),
  isActive: z.boolean().default(true),
});
export type CreateProduct = z.infer<typeof CreateProductSchema>;

export const UpdateProductSchema = CreateProductSchema.partial();
export type UpdateProduct = z.infer<typeof UpdateProductSchema>;

export const ProductResponseSchema = z.object({
  id: UuidString,
  name: z.string(),
  sellPrice: MoneyString,
  /** Percent, 0–100 (ADR-024). Serialized at 2dp like the column. */
  wastePercent: MoneyString,
  isActive: z.boolean(),
  photoUrl: z.string().nullable().optional(),
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
});
export type ProductResponse = z.infer<typeof ProductResponseSchema>;

/** Recipe fan-out so the POS can compute cart-aware makeable quantities (advisory, ADR-013). */
export const ProductRecipeItemSchema = z.object({
  rawMaterialId: UuidString,
  quantityUsed: QuantityString,
});
export type ProductRecipeItem = z.infer<typeof ProductRecipeItemSchema>;

export const ProductWithHppResponseSchema = ProductResponseSchema.extend({
  /** Recipe sum before waste, so the UI can show the uplift (ADR-024). */
  baseHpp: MoneyString.nullable(),
  /** baseHpp × (1 + wastePercent/100), rounded once, HALF_UP (ADR-005). */
  hpp: MoneyString.nullable(),
  hasRecipe: z.boolean(),
  margin: MoneyString.nullable(),
  makeableQuantity: z.number().int().nullable(),
  recipeItems: z.array(ProductRecipeItemSchema),
});
export type ProductWithHppResponse = z.infer<
  typeof ProductWithHppResponseSchema
>;
