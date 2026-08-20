import { describe, expect, it } from 'vitest';
import type { ProductWithHppResponse } from '@ohmypos/api-contracts';
import {
  bucketOf,
  countByBucket,
  filterProducts,
  sellableProducts,
} from './product-filters';

function product(
  overrides: Partial<ProductWithHppResponse> & { id: string; name: string },
): ProductWithHppResponse {
  return {
    sellPrice: '20000.00',
    isActive: true,
    hpp: '8000.00',
    hasRecipe: true,
    margin: '12000.00',
    makeableQuantity: 10,
    photoUrl: null,
    recipeItems: [],
    createdAt: '2026-08-20T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z',
    ...overrides,
  };
}

const kopi = product({ id: 'p1', name: 'Es Kopi Susu' });
const latte = product({ id: 'p2', name: 'Latte' });
const air = product({
  id: 'p3',
  name: 'Air Mineral',
  hasRecipe: false,
  hpp: null,
});
const arsip = product({ id: 'p4', name: 'Menu Lama', isActive: false });

const products = [kopi, latte, air, arsip];
const headroom = new Map<string, number | null>([
  ['p1', 5],
  ['p2', 0],
  ['p3', null],
  ['p4', 3],
]);

describe('sellableProducts', () => {
  it('drops inactive products', () => {
    expect(sellableProducts(products).map((p) => p.id)).toEqual([
      'p1',
      'p2',
      'p3',
    ]);
  });
});

describe('bucketOf', () => {
  it('classifies a product with headroom as READY', () => {
    expect(bucketOf(kopi, 5)).toBe('READY');
  });

  it('classifies exhausted headroom as OUT', () => {
    expect(bucketOf(latte, 0)).toBe('OUT');
  });

  it('classifies a recipeless product as NO_RECIPE regardless of headroom', () => {
    expect(bucketOf(air, null)).toBe('NO_RECIPE');
    expect(bucketOf(air, 99)).toBe('NO_RECIPE');
  });

  it('treats unknown headroom as READY — headroom is advisory, not a gate', () => {
    expect(bucketOf(kopi, undefined)).toBe('READY');
  });
});

describe('countByBucket', () => {
  it('counts each bucket over sellable products only', () => {
    expect(countByBucket(products, headroom)).toEqual([
      { id: 'ALL', label: 'Semua Produk', count: 3 },
      { id: 'READY', label: 'Siap Dibuat', count: 1 },
      { id: 'OUT', label: 'Stok Habis', count: 1 },
      { id: 'NO_RECIPE', label: 'Tanpa Resep', count: 1 },
    ]);
  });

  it('keeps the three sub-counts summing to ALL', () => {
    const counts = countByBucket(products, headroom);
    const all = counts.find((c) => c.id === 'ALL')!.count;
    const rest = counts
      .filter((c) => c.id !== 'ALL')
      .reduce((sum, c) => sum + c.count, 0);
    expect(rest).toBe(all);
  });
});

describe('filterProducts', () => {
  it('returns every sellable product for ALL with no query', () => {
    expect(
      filterProducts({ products, headroom, bucket: 'ALL', query: '' }).map(
        (p) => p.id,
      ),
    ).toEqual(['p1', 'p2', 'p3']);
  });

  it('narrows to a bucket', () => {
    expect(
      filterProducts({ products, headroom, bucket: 'OUT', query: '' }).map(
        (p) => p.id,
      ),
    ).toEqual(['p2']);
  });

  it('matches the name case-insensitively', () => {
    expect(
      filterProducts({ products, headroom, bucket: 'ALL', query: 'KOPI' }).map(
        (p) => p.id,
      ),
    ).toEqual(['p1']);
  });

  it('applies bucket and query together', () => {
    expect(
      filterProducts({ products, headroom, bucket: 'READY', query: 'latte' }),
    ).toEqual([]);
  });

  it('ignores surrounding whitespace in the query', () => {
    expect(
      filterProducts({
        products,
        headroom,
        bucket: 'ALL',
        query: '  latte  ',
      }).map((p) => p.id),
    ).toEqual(['p2']);
  });
});
