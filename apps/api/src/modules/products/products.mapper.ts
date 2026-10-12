import { Prisma } from '../../generated/prisma/client';
import { calculateBaseHpp, calculateHpp } from './hpp.calculator';
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
  const lines = product.recipeItems.map((ri) => ({
    quantityUsed: ri.quantityUsed,
    unitCost: ri.rawMaterial.unitCost,
  }));
  // Same lines feed both, so the UI uplift is exactly hpp − baseHpp (ADR-024).
  const baseHpp = calculateBaseHpp(lines);
  const hpp = calculateHpp(lines, product.wastePercent);
  const hasRecipe = product.recipeItems.length > 0;

  return {
    id: product.id,
    name: product.name,
    sellPrice: product.sellPrice.toFixed(2),
    wastePercent: product.wastePercent.toFixed(2),
    isActive: product.isActive,
    photoUrl: product.photoUrl ?? null,
    // Rounded for display only; calculateHpp uses the unrounded value.
    baseHpp: baseHpp
      ? baseHpp.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2)
      : null,
    hpp: hpp ? hpp.toFixed(2) : null,
    hasRecipe,
    margin: hpp ? product.sellPrice.minus(hpp).toFixed(2) : null,
    makeableQuantity: hasRecipe
      ? computeMakeableQuantity(product.recipeItems)
      : null,
    // For the POS cart's makeable quantity; reuses the eager-loaded rows.
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
        unitCost: ri.rawMaterial.unitCost.toFixed(6),
        // Display only; never summed into HPP.
        lineCost: ri.quantityUsed
          .times(ri.rawMaterial.unitCost)
          .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
          .toFixed(2),
      })),
      baseHpp: productResponse.baseHpp,
      wastePercent: productResponse.wastePercent,
      hpp: productResponse.hpp,
      hasRecipe: productResponse.hasRecipe,
    },
    product: productResponse,
  };
}
