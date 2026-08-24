/**
 * Product schemas (ERD §3, ADR-005, ADR-010, ADR-013).
 *
 * Product has no stored HPP or stock fields. HPP is computed live from recipe items,
 * and makeable quantity is derived on read queries (ADR-013).
 */
import { z } from 'zod';
import { MoneyString, QuantityString, UuidString } from './primitives';

export const CreateProductSchema = z.object({
  name: z.string().trim().min(1).max(120),
  sellPrice: MoneyString,
  isActive: z.boolean().default(true),
});
export type CreateProduct = z.infer<typeof CreateProductSchema>;

export const UpdateProductSchema = CreateProductSchema.partial();
export type UpdateProduct = z.infer<typeof UpdateProductSchema>;

export const ProductResponseSchema = z.object({
  id: UuidString,
  name: z.string(),
  sellPrice: MoneyString,
  isActive: z.boolean(),
  photoUrl: z.string().nullable().optional(),
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
});
export type ProductResponse = z.infer<typeof ProductResponseSchema>;

/**
 * Recipe fan-out for a product, exposed on read.
 *
 * `makeableQuantity` above is computed per product in isolation, so two products
 * sharing a raw material each report a maximum that is not jointly satisfiable.
 * The POS needs the fan-out to subtract what the rest of the cart already claims
 * before it can show an honest number (ADR-013 — advisory only; the authoritative
 * check is the row-locked sufficiency test at sale time, ADR-007).
 */
export const ProductRecipeItemSchema = z.object({
  rawMaterialId: UuidString,
  quantityUsed: QuantityString,
});
export type ProductRecipeItem = z.infer<typeof ProductRecipeItemSchema>;

export const ProductWithHppResponseSchema = ProductResponseSchema.extend({
  hpp: MoneyString.nullable(),
  hasRecipe: z.boolean(),
  margin: MoneyString.nullable(),
  makeableQuantity: z.number().int().nullable(),
  recipeItems: z.array(ProductRecipeItemSchema),
});
export type ProductWithHppResponse = z.infer<
  typeof ProductWithHppResponseSchema
>;
