import { describe, expect, it } from 'vitest';
import type { ProductWithHppResponse } from '@ohmypos/api-contracts';
import { ApiError } from '@/lib/api';
import { mapSubmitError } from './submit-error';
import type { CartLine } from './cart.reducer';

const SUSU = 'aaaaaaaa-1111-4111-8111-111111111111';
const GULA = 'bbbbbbbb-2222-4222-8222-222222222222';
const PRODUCT_A = 'dddddddd-1111-4111-8111-111111111111';
const PRODUCT_B = 'eeeeeeee-2222-4222-8222-222222222222';

const products: ProductWithHppResponse[] = [
  {
    id: PRODUCT_A,
    name: 'Es Kopi Susu',
    sellPrice: '20000.00',
    wastePercent: '0.00',
    baseHpp: '8000.00',
    isActive: true,
    hpp: '8000.00',
    hasRecipe: true,
    margin: '12000.00',
    makeableQuantity: 10,
    recipeItems: [{ rawMaterialId: SUSU, quantityUsed: '1.0000' }],
    createdAt: '2026-08-17T00:00:00.000Z',
    updatedAt: '2026-08-17T00:00:00.000Z',
  },
  {
    id: PRODUCT_B,
    name: 'Teh Manis',
    sellPrice: '10000.00',
    wastePercent: '0.00',
    baseHpp: '2000.00',
    isActive: true,
    hpp: '2000.00',
    hasRecipe: true,
    margin: '8000.00',
    makeableQuantity: 99,
    recipeItems: [{ rawMaterialId: GULA, quantityUsed: '0.0100' }],
    createdAt: '2026-08-17T00:00:00.000Z',
    updatedAt: '2026-08-17T00:00:00.000Z',
  },
];

const lines: CartLine[] = [
  {
    id: 'l1',
    productId: PRODUCT_A,
    productName: 'Es Kopi Susu',
    masterPrice: '20000.00',
    overridePrice: null,
    quantity: 12,
  },
  {
    id: 'l2',
    productId: PRODUCT_B,
    productName: 'Teh Manis',
    masterPrice: '10000.00',
    overridePrice: null,
    quantity: 1,
  },
];

function map(error: unknown) {
  return mapSubmitError({ error, lines, products });
}

describe('mapSubmitError — insufficient stock', () => {
  const insufficient = new ApiError(
    'Insufficient stock: Susu UHT (butuh 12.0000, tersedia 8.0000)',
    409,
    {
      statusCode: 409,
      code: 'INSUFFICIENT_STOCK',
      message: 'Insufficient stock: Susu UHT (butuh 12.0000, tersedia 8.0000)',
      details: {
        shortfalls: [
          {
            rawMaterialId: SUSU,
            name: 'Susu UHT',
            required: '12.0000',
            available: '8.0000',
          },
        ],
      },
    },
  );

  it('maps the shortfall back to only the lines that consume it', () => {
    const result = map(insufficient);

    expect(result.kind).toBe('INSUFFICIENT_STOCK');
    // l2 (Teh Manis) uses Gula, not Susu — it must not be blamed.
    expect(result.lineIds).toEqual(['l1']);
    expect(result.shortfalls).toHaveLength(1);
  });

  it('names the material and the numbers in Indonesian', () => {
    const result = map(insufficient);
    expect(result.message).toContain('Susu UHT');
    expect(result.message).toContain('butuh 12');
    expect(result.message).toContain('tersedia 8');
  });

  it('blames every line touching a short material, across products', () => {
    const bothShort = new ApiError('Insufficient stock', 409, {
      statusCode: 409,
      code: 'INSUFFICIENT_STOCK',
      message: 'Insufficient stock',
      details: {
        shortfalls: [
          {
            rawMaterialId: SUSU,
            name: 'Susu UHT',
            required: '12.0000',
            available: '8.0000',
          },
          {
            rawMaterialId: GULA,
            name: 'Gula Aren',
            required: '1.0000',
            available: '0.0000',
          },
        ],
      },
    });

    expect(map(bothShort).lineIds).toEqual(['l1', 'l2']);
  });
});

describe('mapSubmitError — other statuses', () => {
  it('treats a 409 without structured details as a stale product list', () => {
    // InactiveProductException / RecipeIncompleteException carry no `details`.
    const result = map(
      new ApiError('Product(s) are inactive and cannot be sold: Latte', 409, {
        statusCode: 409,
        error: 'Conflict',
        message: 'Product(s) are inactive and cannot be sold: Latte',
      }),
    );

    expect(result.kind).toBe('STALE_PRODUCT');
    expect(result.message).toContain('Latte');
  });

  it('maps a 404 to a stale product', () => {
    expect(map(new ApiError('Product(s) not found: x', 404)).kind).toBe(
      'STALE_PRODUCT',
    );
  });

  it('maps a 403 to a forbidden message and blames no line', () => {
    const result = map(new ApiError('Forbidden', 403));
    expect(result.kind).toBe('FORBIDDEN');
    expect(result.lineIds).toEqual([]);
  });

  it('maps a 400 to the server message verbatim', () => {
    const result = map(new ApiError('soldAt cannot be in the future', 400));
    expect(result.kind).toBe('INVALID');
    expect(result.message).toBe('soldAt cannot be in the future');
  });
});

describe('mapSubmitError — the uncertain case', () => {
  it('marks a thrown fetch as UNCERTAIN, never as a retryable error', () => {
    // POST /sales has no idempotency key: a blind retry could double-write money.
    const result = map(new TypeError('Failed to fetch'));

    expect(result.kind).toBe('UNCERTAIN');
    expect(result.message).toContain('belum pasti');
    expect(result.message).toContain('periksa transaksi terakhir');
  });

  it('marks a 5xx as UNCERTAIN too — the transaction may have committed', () => {
    const result = map(new ApiError('Internal Server Error', 500));
    expect(result.kind).toBe('UNCERTAIN');
  });

  it('does not treat a 4xx as uncertain', () => {
    expect(map(new ApiError('Conflict', 409, null)).kind).not.toBe('UNCERTAIN');
  });
});
