/**
 * POS filter buckets by availability (Product has no category, DEBT-018). The
 * buckets are exhaustive and exclusive, so their counts sum to ALL.
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

/** Bucket rules match `canAddProduct`: no recipe = unsellable, zero headroom = out, unknown = ready. */
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

/** Filter card counts; recomputed on every cart change because headroom is cart-aware. */
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

/** Filter and search run client-side: `GET /products` is unpaginated. */
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
