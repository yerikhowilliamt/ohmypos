/**
 * Recipe schemas (ERD §3, ADR-005, ADR-010, ADR-013).
 *
 * Bill of materials for a product. A recipe full-replace update payload validates that
 * quantityUsed is strictly positive and that rawMaterialId values are unique per recipe.
 */
import { z } from 'zod';
import {
  MoneyString,
  QuantityString,
  UnitCostString,
  UuidString,
} from './primitives';
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
  /** The material's STOCK/RECIPE unit — a recipe is always in stock units (ADR-024). */
  unit: z.string(),
  quantityUsed: QuantityString,
  unitCost: UnitCostString,
  /** Display only — never summed to produce HPP (§9.7a). */
  lineCost: MoneyString,
});
export type RecipeItemResponse = z.infer<typeof RecipeItemResponseSchema>;

export const RecipeResponseSchema = z.object({
  productId: UuidString,
  items: z.array(RecipeItemResponseSchema),
  /**
   * Recipe sum BEFORE the product's waste allowance — the figure the item
   * `lineCost` values add up to. Exposed so the editor can show
   * subtotal → waste → HPP and the uplift is auditable (ADR-024).
   */
  baseHpp: MoneyString.nullable(),
  /** The product's waste allowance, echoed so the editor need not refetch it. */
  wastePercent: MoneyString,
  /** baseHpp × (1 + wastePercent/100), rounded once (ADR-005, ADR-024). */
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
