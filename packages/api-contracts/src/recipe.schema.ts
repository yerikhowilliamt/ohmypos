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
  /** Strictly positive (makeable quantity divides by it). */
  quantityUsed: QuantityString.refine(
    (v) => Number(v) > 0,
    'Harus lebih besar dari 0',
  ),
});
export type RecipeItemInput = z.infer<typeof RecipeItemInputSchema>;

export const ReplaceRecipeSchema = z.object({
  /** An empty array clears the recipe. */
  items: z.array(RecipeItemInputSchema).superRefine((items, ctx) => {
    const seen = new Set<string>();
    for (const [index, item] of items.entries()) {
      if (seen.has(item.rawMaterialId)) {
        ctx.addIssue({
          code: 'custom',
          path: [index, 'rawMaterialId'],
          message:
            'Bahan baku yang sama tercantum dua kali. Gabungkan menjadi satu baris.',
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
  /** Display only; never summed into HPP. */
  lineCost: MoneyString,
});
export type RecipeItemResponse = z.infer<typeof RecipeItemResponseSchema>;

export const RecipeResponseSchema = z.object({
  productId: UuidString,
  items: z.array(RecipeItemResponseSchema),
  /** Recipe sum before waste (ADR-024). */
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
