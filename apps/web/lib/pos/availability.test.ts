import { describe, expect, it } from 'vitest';
import type {
  ProductWithHppResponse,
  RawMaterialResponse,
} from '@ohmypos/api-contracts';
import { canAddProduct, computeCartAvailability } from './availability';
import type { CartLine } from './cart.reducer';

const SUSU = 'aaaaaaaa-1111-4111-8111-111111111111';
const KOPI = 'bbbbbbbb-2222-4222-8222-222222222222';
const GULA = 'cccccccc-3333-4333-8333-333333333333';

function rawMaterial(
  id: string,
  name: string,
  currentStock: string,
): RawMaterialResponse {
  return {
    id,
    name,
    unit: 'liter',
    unitCost: '20000.00',
    currentStock,
    lowStockThreshold: '0.0000',
    createdAt: '2026-08-17T00:00:00.000Z',
    updatedAt: '2026-08-17T00:00:00.000Z',
  };
}

function product(
  id: string,
  name: string,
  recipeItems: { rawMaterialId: string; quantityUsed: string }[],
  overrides: Partial<ProductWithHppResponse> = {},
): ProductWithHppResponse {
  return {
    id,
    name,
    sellPrice: '20000.00',
    isActive: true,
    hpp: '8000.00',
    hasRecipe: recipeItems.length > 0,
    margin: '12000.00',
    makeableQuantity: null,
    recipeItems,
    createdAt: '2026-08-17T00:00:00.000Z',
    updatedAt: '2026-08-17T00:00:00.000Z',
    ...overrides,
  };
}

function line(
  id: string,
  productId: string,
  quantity: number,
  overridePrice: string | null = null,
): CartLine {
  return {
    id,
    productId,
    productName: productId,
    masterPrice: '20000.00',
    overridePrice,
    quantity,
  };
}

const PRODUCT_A = 'pppppppp-1111-4111-8111-111111111111';
const PRODUCT_B = 'pppppppp-2222-4222-8222-222222222222';

describe('computeCartAvailability — cart contention', () => {
  it('drops a sibling product headroom when the cart claims a shared material', () => {
    // A and B both drink from Susu. Independently, the API would report
    // makeableQuantity 10 for A (10 / 1) and 5 for B (10 / 2).
    const products = [
      product(PRODUCT_A, 'Es Kopi Susu', [
        { rawMaterialId: SUSU, quantityUsed: '1.0000' },
      ]),
      product(PRODUCT_B, 'Latte', [
        { rawMaterialId: SUSU, quantityUsed: '2.0000' },
      ]),
    ];
    const rawMaterials = [rawMaterial(SUSU, 'Susu UHT', '10.0000')];

    const empty = computeCartAvailability({
      products,
      rawMaterials,
      lines: [],
    });
    expect(empty.headroom.get(PRODUCT_A)).toBe(10);
    expect(empty.headroom.get(PRODUCT_B)).toBe(5);

    // Put 3 × A in the cart: 3 liters claimed, 7 left.
    const withCart = computeCartAvailability({
      products,
      rawMaterials,
      lines: [line('l1', PRODUCT_A, 3)],
    });

    expect(withCart.headroom.get(PRODUCT_A)).toBe(7);
    // B must fall from 5 to 3 — this is the number the per-product API field
    // cannot produce, and the whole reason this module exists.
    expect(withCart.headroom.get(PRODUCT_B)).toBe(3);
    expect(withCart.shortfalls).toEqual([]);
  });

  it('sums demand across two lines of the same product at different prices', () => {
    const products = [
      product(PRODUCT_A, 'Es Kopi Susu', [
        { rawMaterialId: SUSU, quantityUsed: '1.0000' },
      ]),
    ];
    const rawMaterials = [rawMaterial(SUSU, 'Susu UHT', '10.0000')];

    // The price-override case: one line at menu price, one discounted. They are
    // separate lines but contend for stock as a single summed demand.
    const result = computeCartAvailability({
      products,
      rawMaterials,
      lines: [line('l1', PRODUCT_A, 4), line('l2', PRODUCT_A, 3, '15000.00')],
    });

    expect(result.demand.get(SUSU)).toEqual({ units: 70000n, scale: 4 });
    expect(result.headroom.get(PRODUCT_A)).toBe(3);
  });

  it('binds headroom to the scarcest material when a recipe uses several', () => {
    const products = [
      product(PRODUCT_A, 'Es Kopi Susu', [
        { rawMaterialId: SUSU, quantityUsed: '1.0000' },
        { rawMaterialId: KOPI, quantityUsed: '0.0180' },
        { rawMaterialId: GULA, quantityUsed: '0.0500' },
      ]),
    ];
    const rawMaterials = [
      rawMaterial(SUSU, 'Susu UHT', '100.0000'), // 100 servings
      rawMaterial(KOPI, 'Biji Kopi', '0.9000'), // 50 servings — the binding one
      rawMaterial(GULA, 'Gula Aren', '10.0000'), // 200 servings
    ];

    const result = computeCartAvailability({
      products,
      rawMaterials,
      lines: [],
    });
    expect(result.headroom.get(PRODUCT_A)).toBe(50);
  });

  it('floors exactly at a whole boundary rather than one short', () => {
    const products = [
      product(PRODUCT_A, 'Es Kopi Susu', [
        { rawMaterialId: SUSU, quantityUsed: '1.0000' },
      ]),
    ];
    const rawMaterials = [rawMaterial(SUSU, 'Susu UHT', '3.0000')];

    const result = computeCartAvailability({
      products,
      rawMaterials,
      lines: [],
    });
    expect(result.headroom.get(PRODUCT_A)).toBe(3);
  });

  it('reports every over-committed material and the lines implicated, across products', () => {
    const products = [
      product(PRODUCT_A, 'Es Kopi Susu', [
        { rawMaterialId: SUSU, quantityUsed: '1.0000' },
      ]),
      product(PRODUCT_B, 'Latte', [
        { rawMaterialId: SUSU, quantityUsed: '2.0000' },
        { rawMaterialId: GULA, quantityUsed: '1.0000' },
      ]),
    ];
    const rawMaterials = [
      rawMaterial(SUSU, 'Susu UHT', '4.0000'),
      rawMaterial(GULA, 'Gula Aren', '100.0000'),
    ];

    // 3 × A (3 liters) + 2 × B (4 liters) = 7 liters against 4 in stock.
    const result = computeCartAvailability({
      products,
      rawMaterials,
      lines: [line('l1', PRODUCT_A, 3), line('l2', PRODUCT_B, 2)],
    });

    expect(result.shortfalls).toEqual([
      {
        rawMaterialId: SUSU,
        name: 'Susu UHT',
        required: '7.0000',
        available: '4.0000',
      },
    ]);
    // One short material implicates BOTH lines, because both consume it.
    expect(result.overCommittedLineIds).toEqual(['l1', 'l2']);
    expect(result.remaining.get(SUSU)).toEqual({ units: -30000n, scale: 4 });
  });

  it('leaves a line alone when it shares no material with the shortfall', () => {
    const products = [
      product(PRODUCT_A, 'Es Kopi Susu', [
        { rawMaterialId: SUSU, quantityUsed: '5.0000' },
      ]),
      product(PRODUCT_B, 'Teh Manis', [
        { rawMaterialId: GULA, quantityUsed: '0.0100' },
      ]),
    ];
    const rawMaterials = [
      rawMaterial(SUSU, 'Susu UHT', '1.0000'),
      rawMaterial(GULA, 'Gula Aren', '100.0000'),
    ];

    const result = computeCartAvailability({
      products,
      rawMaterials,
      lines: [line('l1', PRODUCT_A, 1), line('l2', PRODUCT_B, 1)],
    });

    expect(result.shortfalls.map((s) => s.rawMaterialId)).toEqual([SUSU]);
    expect(result.overCommittedLineIds).toEqual(['l1']);
  });

  it('reports null headroom for a recipeless product, never zero', () => {
    // Mirrors calculateHpp returning null rather than 0 (ADR-013): "no recipe"
    // and "out of stock" are different states and must not render the same.
    const products = [product(PRODUCT_A, 'Air Mineral', [])];
    const result = computeCartAvailability({
      products,
      rawMaterials: [],
      lines: [],
    });

    expect(result.headroom.get(PRODUCT_A)).toBeNull();
  });

  it('treats an unknown raw material as zero stock (fails closed)', () => {
    // Same choice assertSufficientStock makes server-side.
    const products = [
      product(PRODUCT_A, 'Es Kopi Susu', [
        { rawMaterialId: SUSU, quantityUsed: '1.0000' },
      ]),
    ];

    const result = computeCartAvailability({
      products,
      rawMaterials: [],
      lines: [line('l1', PRODUCT_A, 1)],
    });

    expect(result.headroom.get(PRODUCT_A)).toBe(0);
    expect(result.shortfalls).toHaveLength(1);
    expect(result.shortfalls[0]?.available).toBe('0.0000');
  });

  it('accumulates the fan-out at full precision before rounding once', () => {
    /**
     * ADR-015 decision 3 mandates summing the exact products and rounding ONCE
     * per material. With whole-unit cart quantities and 4dp `quantityUsed`, every
     * product is already exact at 4dp, so round-once and round-per-line coincide
     * today — this asserts the exact value, and the round-once structure is what
     * keeps that true if fractional quantities are ever allowed (the API's
     * `QuantityString` already permits them).
     */
    const products = [
      product(PRODUCT_A, 'Es Kopi Susu', [
        { rawMaterialId: SUSU, quantityUsed: '0.3334' },
      ]),
      product(PRODUCT_B, 'Latte', [
        { rawMaterialId: SUSU, quantityUsed: '0.0001' },
      ]),
    ];
    const rawMaterials = [rawMaterial(SUSU, 'Susu UHT', '10.0000')];

    const result = computeCartAvailability({
      products,
      rawMaterials,
      // 3 × 0.3334 = 1.0002, plus 7 × 0.0001 = 0.0007 → 1.0009 exactly.
      lines: [line('l1', PRODUCT_A, 3), line('l2', PRODUCT_B, 7)],
    });

    expect(result.demand.get(SUSU)).toEqual({ units: 10009n, scale: 4 });
    // And the sub-unit demand still moves headroom, rather than being lost.
    // (10.0000 - 1.0009) / 0.0001 = 89991
    expect(result.headroom.get(PRODUCT_B)).toBe(89991);
  });

  it('ignores a cart line whose product is no longer in the product list', () => {
    const result = computeCartAvailability({
      products: [],
      rawMaterials: [rawMaterial(SUSU, 'Susu UHT', '10.0000')],
      lines: [line('l1', PRODUCT_A, 3)],
    });

    expect(result.demand.size).toBe(0);
    expect(result.shortfalls).toEqual([]);
  });
});

describe('canAddProduct', () => {
  it('blocks a recipeless product — the server would 409 every time', () => {
    const p = product(PRODUCT_A, 'Air Mineral', []);
    expect(canAddProduct(p, null)).toBe(false);
  });

  it('blocks an inactive product', () => {
    const p = product(
      PRODUCT_A,
      'Es Kopi Susu',
      [{ rawMaterialId: SUSU, quantityUsed: '1.0000' }],
      { isActive: false },
    );
    expect(canAddProduct(p, 10)).toBe(false);
  });

  it('blocks a product with no headroom left', () => {
    const p = product(PRODUCT_A, 'Es Kopi Susu', [
      { rawMaterialId: SUSU, quantityUsed: '1.0000' },
    ]);
    expect(canAddProduct(p, 0)).toBe(false);
  });

  it('allows a sellable product with headroom', () => {
    const p = product(PRODUCT_A, 'Es Kopi Susu', [
      { rawMaterialId: SUSU, quantityUsed: '1.0000' },
    ]);
    expect(canAddProduct(p, 1)).toBe(true);
  });
});
