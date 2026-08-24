import { describe, expect, it } from 'vitest';
import { CreateSaleSchema } from '@ohmypos/api-contracts';
import { cartItemCount, cartTotal, lineTotal } from './cart-totals';
import { toCreateSale } from './to-create-sale';
import type { CartLine } from './cart.reducer';

const BRANCH_ID = 'bbbbbbbb-1111-4111-8111-111111111111';
const ACCOUNT_ID = 'cccccccc-2222-4222-8222-222222222222';
const PRODUCT_A = 'dddddddd-1111-4111-8111-111111111111';
const PRODUCT_B = 'eeeeeeee-2222-4222-8222-222222222222';

function line(
  id: string,
  productId: string,
  quantity: number,
  masterPrice: string,
  overridePrice: string | null = null,
): CartLine {
  return {
    id,
    productId,
    productName: id,
    masterPrice,
    overridePrice,
    quantity,
  };
}

describe('cart totals (ADR-015)', () => {
  it('computes a line total as quantity × effective unit price', () => {
    expect(lineTotal(line('l1', PRODUCT_A, 2, '18000.00'))).toBe('36000.00');
  });

  it('uses the override, not the master price, when one is set', () => {
    expect(lineTotal(line('l1', PRODUCT_A, 2, '20000.00', '15000'))).toBe(
      '30000.00',
    );
  });

  it('sums line totals with no tax and no discount line', () => {
    // Sale.totalAmount is exactly Σ SaleItem.lineTotal (ADR-015 decision 1).
    const lines = [
      line('l1', PRODUCT_A, 2, '18000.00'),
      line('l2', PRODUCT_B, 1, '25000.00'),
      line('l3', PRODUCT_A, 1, '18000.00', '10000'),
    ];
    expect(cartTotal(lines)).toBe('71000.00');
    expect(cartItemCount(lines)).toBe(4);
  });

  it('is exact for a price that would drift in floating point', () => {
    // 3 × 0.10 is 0.30000000000000004 as a float.
    expect(lineTotal(line('l1', PRODUCT_A, 3, '0.10'))).toBe('0.30');
    expect(
      cartTotal([
        line('l1', PRODUCT_A, 1, '0.10'),
        line('l2', PRODUCT_A, 1, '0.20'),
      ]),
    ).toBe('0.30');
  });

  it('returns zero for an empty cart', () => {
    expect(cartTotal([])).toBe('0.00');
    expect(cartItemCount([])).toBe(0);
  });
});

describe('toCreateSale', () => {
  const soldAt = new Date('2026-08-17T03:00:00.000Z');

  it('produces a payload that CreateSaleSchema accepts', () => {
    const result = toCreateSale({
      branchId: BRANCH_ID,
      accountId: ACCOUNT_ID,
      lines: [line('l1', PRODUCT_A, 2, '18000.00')],
      soldAt,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(CreateSaleSchema.safeParse(result.value).success).toBe(true);
    expect(result.value.branchId).toBe(BRANCH_ID);
    expect(result.value.accountId).toBe(ACCOUNT_ID);
    expect(result.value.soldAt).toBe('2026-08-17T03:00:00.000Z');
  });

  it('OMITS unitPrice entirely when there is no override', () => {
    // Not null, not the master price: omission is what tells the server to charge
    // Product.sellPrice and leave isPriceOverridden false.
    const result = toCreateSale({
      branchId: BRANCH_ID,
      accountId: ACCOUNT_ID,
      lines: [line('l1', PRODUCT_A, 1, '18000.00')],
      soldAt,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items[0]).not.toHaveProperty('unitPrice');
    expect(Object.keys(result.value.items[0]!)).toEqual([
      'productId',
      'quantity',
    ]);
  });

  it('sends an override even when it equals the master price', () => {
    // isPriceOverridden is the server's call, not the client's — sending the
    // override verbatim is what keeps that decision in one place.
    const result = toCreateSale({
      branchId: BRANCH_ID,
      accountId: ACCOUNT_ID,
      lines: [line('l1', PRODUCT_A, 1, '18000.00', '18000.00')],
      soldAt,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items[0]?.unitPrice).toBe('18000.00');
  });

  it('serialises quantity as a 4dp decimal string', () => {
    const result = toCreateSale({
      branchId: BRANCH_ID,
      accountId: ACCOUNT_ID,
      lines: [line('l1', PRODUCT_A, 3, '18000.00')],
      soldAt,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items[0]?.quantity).toBe('3.0000');
  });

  it('preserves two lines of the same product at different prices', () => {
    const result = toCreateSale({
      branchId: BRANCH_ID,
      accountId: ACCOUNT_ID,
      lines: [
        line('l1', PRODUCT_A, 2, '18000.00'),
        line('l2', PRODUCT_A, 1, '18000.00', '9000'),
      ],
      soldAt,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items).toHaveLength(2);
    expect(result.value.items[0]?.productId).toBe(PRODUCT_A);
    expect(result.value.items[1]?.productId).toBe(PRODUCT_A);
    expect(result.value.items[1]?.unitPrice).toBe('9000');
  });

  it('reports a validation failure instead of sending an invalid payload', () => {
    const result = toCreateSale({
      branchId: 'not-a-uuid',
      accountId: ACCOUNT_ID,
      lines: [line('l1', PRODUCT_A, 1, '18000.00')],
      soldAt,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('branchId');
  });

  it('rejects an empty cart, matching items.min(1)', () => {
    const result = toCreateSale({
      branchId: BRANCH_ID,
      accountId: ACCOUNT_ID,
      lines: [],
      soldAt,
    });

    expect(result.ok).toBe(false);
  });

  it('rejects a soldAt beyond the schema tolerance window', () => {
    const result = toCreateSale({
      branchId: BRANCH_ID,
      accountId: ACCOUNT_ID,
      lines: [line('l1', PRODUCT_A, 1, '18000.00')],
      soldAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('soldAt');
  });
});
