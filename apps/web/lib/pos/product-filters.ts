/**
 * OhMyPos — POS product discovery filters (DESIGN.md §11.3 Category Filter Row, §11.2 Product Grid & Cards).
 *
 * Pure: no React, no network, no dates.
 *
 * DESIGN.md §11.3 Category Filter Row illustrates the filter row with menu categories (Foods,
 * Beverage). `Product` has no category column (schema.prisma:354, DEBT-018), so
 * this module buckets by the one product-level fact POS already computes: the
 * cart-aware makeable quantity from `availability.ts` (ADR-013). Same card
 * anatomy as §22, real predicates behind it.
 *
 * The buckets are exhaustive and mutually exclusive, so the three non-ALL
 * counts always sum to the ALL count — a cashier can trust the row.
 */
import type { ProductWithHppResponse } from '@ohmypos/api-contracts';

export type ProductBucket = 'ALL' | 'READY' | 'OUT' | 'NO_RECIPE';

export interface BucketDefinition {
  id: ProductBucket;
  label: string;
}

/** Row order, left to right. `ALL` is always first and always the default. */
export const PRODUCT_BUCKETS: BucketDefinition[] = [
  { id: 'ALL', label: 'Semua Produk' },
  { id: 'READY', label: 'Siap Dibuat' },
  { id: 'OUT', label: 'Stok Habis' },
  { id: 'NO_RECIPE', label: 'Tanpa Resep' },
];

/**
 * Mirrors `canAddProduct`'s reasoning (availability.ts) so the row never
 * disagrees with whether a tile is enabled:
 *
 * - no recipe  → unsellable outright (`RecipeIncompleteException`, ADR-015)
 * - headroom 0 → the cart already claims every unit the shared pool allows
 * - unknown headroom → READY, because headroom is advisory and never a gate
 */
export function bucketOf(
  product: ProductWithHppResponse,
  headroom: number | null | undefined,
): Exclude<ProductBucket, 'ALL'> {
  if (!product.hasRecipe) return 'NO_RECIPE';
  if (headroom === null || headroom === undefined) return 'READY';
  return headroom > 0 ? 'READY' : 'OUT';
}

/** Only active products are sellable — `InactiveProductException` (409). */
export function sellableProducts(
  products: ProductWithHppResponse[],
): ProductWithHppResponse[] {
  return products.filter((product) => product.isActive);
}

export interface BucketCount {
  id: ProductBucket;
  label: string;
  count: number;
}

/**
 * The counts rendered on the §22 filter cards. Recomputed on every cart change,
 * because headroom is cart-aware — adding the last Latte moves it from
 * "Siap Dibuat" to "Stok Habis" while the cashier watches.
 */
export function countByBucket(
  products: ProductWithHppResponse[],
  headroom: Map<string, number | null>,
): BucketCount[] {
  const sellable = sellableProducts(products);
  const tally: Record<Exclude<ProductBucket, 'ALL'>, number> = {
    READY: 0,
    OUT: 0,
    NO_RECIPE: 0,
  };

  for (const product of sellable) {
    tally[bucketOf(product, headroom.get(product.id))] += 1;
  }

  return PRODUCT_BUCKETS.map((bucket) => ({
    id: bucket.id,
    label: bucket.label,
    count: bucket.id === 'ALL' ? sellable.length : tally[bucket.id],
  }));
}

export interface FilterProductsInput {
  products: ProductWithHppResponse[];
  headroom: Map<string, number | null>;
  bucket: ProductBucket;
  query: string;
}

/**
 * `GET /products` is unpaginated master data (products.service.ts), so both the
 * filter and the search run client-side and are instant — DESIGN.md §11.2 Product Grid & Cards asks
 * for a fast search, and a round trip per keystroke would not be.
 */
export function filterProducts({
  products,
  headroom,
  bucket,
  query,
}: FilterProductsInput): ProductWithHppResponse[] {
  const needle = query.trim().toLowerCase();

  return sellableProducts(products).filter((product) => {
    if (
      bucket !== 'ALL' &&
      bucketOf(product, headroom.get(product.id)) !== bucket
    ) {
      return false;
    }
    if (needle && !product.name.toLowerCase().includes(needle)) {
      return false;
    }
    return true;
  });
}
