/**
 * OhMyPos — cart-aware makeable quantity (ADR-013, Phase 8c plan §3).
 *
 * `ProductWithHppResponse.makeableQuantity` answers "how many of this product
 * could I make if the cart were empty". It is computed per product in isolation
 * (`products.mapper.ts`), so when two products share a raw material their two
 * numbers are not jointly satisfiable. This module subtracts what the rest of the
 * cart already claims before reporting headroom.
 *
 * ADR-013 is explicit that this figure is advisory: "never authoritative, and
 * never reserved". Stock is a single centralized pool (ADR-004) that another
 * branch can decrement concurrently, so headroom can be stale the instant it
 * renders. The authoritative check is `assertSufficientStock` under row locks at
 * sale time (ADR-007); a 409 on submit is the real contract, not the exception.
 *
 * Pure: no React, no network.
 */
import type {
  ProductWithHppResponse,
  RawMaterialResponse,
} from '@ohmypos/api-contracts';
import {
  addFixed,
  compareFixed,
  divFloorToInt,
  fromInt,
  mulFixed,
  parseFixed,
  roundHalfUp,
  subFixed,
  zero,
  QUANTITY_SCALE,
  type Fixed,
} from '@/lib/decimal';
import type { CartLine } from './cart.reducer';

export interface AvailabilityShortfall {
  rawMaterialId: string;
  name: string;
  required: string;
  available: string;
}

export interface CartAvailability {
  /** Total quantity of each raw material the cart currently claims. */
  demand: Map<string, Fixed>;
  /** `currentStock - demand` per raw material. Negative means over-committed. */
  remaining: Map<string, Fixed>;
  /**
   * How many MORE of each product can be added given what the cart already
   * claims. `null` for a product with no recipe (mirrors `calculateHpp`
   * returning `null` rather than 0 — ADR-013).
   */
  headroom: Map<string, number | null>;
  /** Raw materials the cart already over-commits, in stable name order. */
  shortfalls: AvailabilityShortfall[];
  /** Cart lines whose recipe touches at least one shortfall material. */
  overCommittedLineIds: string[];
}

export interface ComputeCartAvailabilityInput {
  products: ProductWithHppResponse[];
  rawMaterials: RawMaterialResponse[];
  lines: CartLine[];
}

export function computeCartAvailability({
  products,
  rawMaterials,
  lines,
}: ComputeCartAvailabilityInput): CartAvailability {
  const productById = new Map(products.map((p) => [p.id, p]));
  const materialById = new Map(rawMaterials.map((rm) => [rm.id, rm]));

  /**
   * Sum every line's contribution at FULL precision, then round once per material
   * at the end. This is the rule ADR-015 decision 3 sets for the server's
   * `aggregateStockRequirements`: "rounding per line and then summing drifts, and
   * the drift lands in RawMaterial.currentStock where it never washes out."
   * Deviating here would make the client disagree with the server exactly at the
   * boundary where the advice matters most.
   *
   * Note this is the OPPOSITE rule from sale totals, which round per line and
   * then sum (see `cart-totals.ts`). Swapping them is the bug ADR-015 warns about.
   */
  const exactDemand = new Map<string, Fixed>();

  for (const line of lines) {
    const product = productById.get(line.productId);
    if (!product) continue;

    const quantity = fromInt(line.quantity, 0);

    for (const item of product.recipeItems) {
      const used = parseFixed(item.quantityUsed, QUANTITY_SCALE);
      const contribution = mulFixed(quantity, used);
      const running = exactDemand.get(item.rawMaterialId);
      exactDemand.set(
        item.rawMaterialId,
        running ? addFixed(running, contribution) : contribution,
      );
    }
  }

  const demand = new Map<string, Fixed>();
  for (const [rawMaterialId, exact] of exactDemand) {
    demand.set(rawMaterialId, roundHalfUp(exact, QUANTITY_SCALE));
  }

  const remaining = new Map<string, Fixed>();
  const shortfalls: AvailabilityShortfall[] = [];

  for (const [rawMaterialId, required] of demand) {
    const material = materialById.get(rawMaterialId);
    /**
     * A material we cannot see is treated as zero stock, not skipped — the same
     * fail-closed choice `assertSufficientStock` makes ("failing open here would
     * let a sale consume a material that no longer exists").
     */
    const available = material
      ? parseFixed(material.currentStock, QUANTITY_SCALE)
      : zero(QUANTITY_SCALE);

    remaining.set(rawMaterialId, subFixed(available, required));

    if (compareFixed(required, available) > 0) {
      shortfalls.push({
        rawMaterialId,
        name: material?.name ?? rawMaterialId,
        required: formatQty(required),
        available: formatQty(available),
      });
    }
  }

  shortfalls.sort((a, b) => a.name.localeCompare(b.name, 'id'));
  const shortMaterialIds = new Set(shortfalls.map((s) => s.rawMaterialId));

  const overCommittedLineIds = lines
    .filter((line) => {
      const product = productById.get(line.productId);
      if (!product) return false;
      return product.recipeItems.some((item) =>
        shortMaterialIds.has(item.rawMaterialId),
      );
    })
    .map((line) => line.id);

  const headroom = new Map<string, number | null>();

  for (const product of products) {
    if (product.recipeItems.length === 0) {
      headroom.set(product.id, null);
      continue;
    }

    let smallest: number | null = null;

    for (const item of product.recipeItems) {
      const material = materialById.get(item.rawMaterialId);
      const stock = material
        ? parseFixed(material.currentStock, QUANTITY_SCALE)
        : zero(QUANTITY_SCALE);
      const claimed = demand.get(item.rawMaterialId) ?? zero(QUANTITY_SCALE);
      const left = subFixed(stock, claimed);

      // ADR-013's formula, evaluated against `remaining` rather than
      // `currentStock`. Integer division on scaled BigInts, so the floor never
      // flips at an exact boundary the way float division does.
      const perItem = divFloorToInt(
        left,
        parseFixed(item.quantityUsed, QUANTITY_SCALE),
      );
      if (perItem === null) continue;

      smallest = smallest === null ? perItem : Math.min(smallest, perItem);
    }

    headroom.set(product.id, smallest);
  }

  return { demand, remaining, headroom, shortfalls, overCommittedLineIds };
}

function formatQty(value: Fixed): string {
  const rounded = roundHalfUp(value, QUANTITY_SCALE);
  const negative = rounded.units < 0n;
  const magnitude = negative ? -rounded.units : rounded.units;
  const digits = magnitude.toString().padStart(QUANTITY_SCALE + 1, '0');
  const intPart = digits.slice(0, digits.length - QUANTITY_SCALE);
  const fracPart = digits.slice(digits.length - QUANTITY_SCALE);
  return `${negative ? '-' : ''}${intPart}.${fracPart}`;
}

/**
 * Whether a product tile should offer an add action. Deliberately conservative
 * about the two cases the server would reject outright, and permissive about
 * headroom (which is advisory).
 */
export function canAddProduct(
  product: ProductWithHppResponse,
  headroom: number | null | undefined,
): boolean {
  // `RecipeIncompleteException` (409): a product with no recipe can never be
  // sold, because `hppAtSale` would have to be null (ADR-015).
  if (!product.hasRecipe) return false;
  // `InactiveProductException` (409).
  if (!product.isActive) return false;
  if (headroom !== null && headroom !== undefined && headroom <= 0)
    return false;
  return true;
}
