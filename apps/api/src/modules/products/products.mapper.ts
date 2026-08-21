/**
 * OhMyPos — product response mapper (ADR-005, ADR-013, ERD §3).
 *
 * Attaches computed `hpp`, `hasRecipe`, `margin`, and derived `makeableQuantity`
 * to Product entities. Ensures all Decimal values are formatted to strings with
 * explicit scale via `.toFixed(scale)` to prevent implicit Prisma.Decimal.toJSON()
 * scale truncation (§9.3).
 */
import { Prisma } from '../../generated/prisma/client';
import { calculateHpp } from './hpp.calculator';
import type {
  ProductWithHppResponse,
  RecipeEnvelopeResponse,
} from '@ohmypos/api-contracts';

export type ProductWithRecipe = Prisma.ProductGetPayload<{
  include: { recipeItems: { include: { rawMaterial: true } } };
}>;

export function toProductWithHppResponse(
  product: ProductWithRecipe,
): ProductWithHppResponse {
  const hpp = calculateHpp(
    product.recipeItems.map((ri) => ({
      quantityUsed: ri.quantityUsed,
      unitCost: ri.rawMaterial.unitCost,
    })),
  );
  const hasRecipe = product.recipeItems.length > 0;

  return {
    id: product.id,
    name: product.name,
    sellPrice: product.sellPrice.toFixed(2),
    isActive: product.isActive,
    hpp: hpp ? hpp.toFixed(2) : null,
    hasRecipe,
    margin: hpp ? product.sellPrice.minus(hpp).toFixed(2) : null,
    makeableQuantity: hasRecipe
      ? computeMakeableQuantity(product.recipeItems)
      : null,
    // Fan-out for the POS's cart-aware makeable quantity (ADR-013). Comes from
    // the `recipeItems` already eagerly included for the HPP calculation above —
    // no extra query, no N+1.
    recipeItems: product.recipeItems.map((ri) => ({
      rawMaterialId: ri.rawMaterialId,
      quantityUsed: ri.quantityUsed.toFixed(4),
    })),
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

function computeMakeableQuantity(
  items: ProductWithRecipe['recipeItems'],
): number | null {
  const usable = items.filter((ri) => ri.quantityUsed.greaterThan(0));
  if (usable.length === 0) return null;
  const perItem = usable.map((ri) =>
    ri.rawMaterial.currentStock.dividedBy(ri.quantityUsed).floor(),
  );
  return Prisma.Decimal.min(...perItem).toNumber(); // whole-unit count — the one legitimate `.toNumber()`
}

export function toRecipeEnvelope(
  product: ProductWithRecipe,
): RecipeEnvelopeResponse {
  const productResponse = toProductWithHppResponse(product);
  return {
    recipe: {
      productId: product.id,
      items: product.recipeItems.map((ri) => ({
        id: ri.id,
        rawMaterialId: ri.rawMaterialId,
        rawMaterialName: ri.rawMaterial.name,
        unit: ri.rawMaterial.unit,
        quantityUsed: ri.quantityUsed.toFixed(4),
        unitCost: ri.rawMaterial.unitCost.toFixed(2),
        // Display only — never summed to produce HPP (§9.7a).
        lineCost: ri.quantityUsed
          .times(ri.rawMaterial.unitCost)
          .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
          .toFixed(2),
      })),
      hpp: productResponse.hpp,
      hasRecipe: productResponse.hasRecipe,
    },
    product: productResponse,
  };
}
