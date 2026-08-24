/**
 * Recipe schemas (ERD §3, ADR-005, ADR-010, ADR-013).
 *
 * Bill of materials for a product. A recipe full-replace update payload validates that
 * quantityUsed is strictly positive and that rawMaterialId values are unique per recipe.
 */
import { z } from 'zod';
import { MoneyString, QuantityString, UuidString } from './primitives';
import { ProductWithHppResponseSchema } from './product.schema';

export const RecipeItemInputSchema = z.object({
  rawMaterialId: UuidString,
  /**
   * Strictly positive: a zero-quantity line is meaningless and would break the
   * makeable-quantity `min` calculation with a divide-by-zero (ADR-013).
   */
  quantityUsed: QuantityString.refine(
    (v) => Number(v) > 0,
    'must be greater than zero',
  ),
});
export type RecipeItemInput = z.infer<typeof RecipeItemInputSchema>;

export const ReplaceRecipeSchema = z.object({
  /** Empty array is legal and means "clear this product's recipe" (§9.7). */
  items: z.array(RecipeItemInputSchema).superRefine((items, ctx) => {
    const seen = new Set<string>();
    for (const [index, item] of items.entries()) {
      if (seen.has(item.rawMaterialId)) {
        ctx.addIssue({
          code: 'custom',
          path: [index, 'rawMaterialId'],
          message: 'duplicate rawMaterialId in the same recipe',
        });
      }
      seen.add(item.rawMaterialId);
    }
  }),
});
export type ReplaceRecipe = z.infer<typeof ReplaceRecipeSchema>;

export const RecipeItemResponseSchema = z.object({
  id: UuidString,
  rawMaterialId: UuidString,
  rawMaterialName: z.string(),
  unit: z.string(),
  quantityUsed: QuantityString,
  unitCost: MoneyString,
  /** Display only — never summed to produce HPP (§9.7a). */
  lineCost: MoneyString,
});
export type RecipeItemResponse = z.infer<typeof RecipeItemResponseSchema>;

export const RecipeResponseSchema = z.object({
  productId: UuidString,
  items: z.array(RecipeItemResponseSchema),
  hpp: MoneyString.nullable(),
  hasRecipe: z.boolean(),
});
export type RecipeResponse = z.infer<typeof RecipeResponseSchema>;

export const RecipeEnvelopeResponseSchema = z.object({
  recipe: RecipeResponseSchema,
  product: ProductWithHppResponseSchema,
});
export type RecipeEnvelopeResponse = z.infer<
  typeof RecipeEnvelopeResponseSchema
>;
