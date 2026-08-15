/**
 * Product schemas (ERD §3, ADR-005, ADR-010, ADR-013).
 *
 * Product has no stored HPP or stock fields. HPP is computed live from recipe items,
 * and makeable quantity is derived on read queries (ADR-013).
 */
import { z } from 'zod';
import { MoneyString, UuidString } from './primitives';

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
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
});
export type ProductResponse = z.infer<typeof ProductResponseSchema>;

export const ProductWithHppResponseSchema = ProductResponseSchema.extend({
  hpp: MoneyString.nullable(),
  hasRecipe: z.boolean(),
  margin: MoneyString.nullable(),
  makeableQuantity: z.number().int().nullable(),
});
export type ProductWithHppResponse = z.infer<
  typeof ProductWithHppResponseSchema
>;
