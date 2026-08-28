/**
 * OhMyPos — unit tests for the purchase conversion + totals calculator
 * (ERD §3, ADR-024).
 *
 * Two rules are under test, and both are the kind a later reader is likely to
 * "harmonise" away:
 *
 * 1. The user enters a quantity in the PURCHASE unit and a TOTAL price. The
 *    normalized stock quantity and the per-stock-unit cost are derived here —
 *    never sent by the client.
 * 2. `unitCost` rounds to 6dp, not 2. It is a rate; rounding Rp10.000 ÷ 3.000
 *    gram to 3,33 understates that product's HPP by ~0,1% forever.
 */
import { Prisma } from '../../generated/prisma/client';
import {
  calculatePurchaseTotal,
  normalizePurchaseLine,
} from './purchase-totals';
import { ZeroNormalizedQuantityException } from './supplier-purchases.exceptions';

const d = (v: string) => new Prisma.Decimal(v);

describe('Purchase conversion (normalizePurchaseLine)', () => {
  it('converts ekor → pcs: 1 ekor at Rp45.000, 1 ekor = 10 pcs', () => {
    const line = normalizePurchaseLine({
      purchaseQuantity: d('1'),
      conversionFactor: d('10'),
      lineTotal: d('45000.00'),
    });

    expect(line.quantity.toFixed(4)).toBe('10.0000');
    expect(line.unitCost.toFixed(6)).toBe('4500.000000');
  });

  it('converts liter → ml: 2 liter at Rp45.000, 1 liter = 1.000 ml', () => {
    const line = normalizePurchaseLine({
      purchaseQuantity: d('2'),
      conversionFactor: d('1000'),
      lineTotal: d('45000.00'),
    });

    expect(line.quantity.toFixed(4)).toBe('2000.0000');
    // The handoff's worked example: Rp22,50 per ml.
    expect(line.unitCost.toFixed(6)).toBe('22.500000');

    // …and a 50 ml recipe line therefore costs exactly Rp1.125.
    expect(line.unitCost.times(50).toFixed(2)).toBe('1125.00');
  });

  it('converts kg → gram and keeps the repeating rate at 6dp', () => {
    const line = normalizePurchaseLine({
      purchaseQuantity: d('3'),
      conversionFactor: d('1000'),
      lineTotal: d('10000.00'),
    });

    expect(line.quantity.toFixed(4)).toBe('3000.0000');
    // 10.000 ÷ 3.000 = 3,333333… — this is the case Decimal(18,2) would have
    // stored as 3,33, making a 3.000-gram recipe cost Rp9.990 instead of
    // Rp10.000, i.e. Rp10 lost on every single unit sold.
    expect(line.unitCost.toFixed(6)).toBe('3.333333');
    // At 6dp the same recipe reconstructs to 9.999,999 → Rp10.000,00.
    expect(line.unitCost.times(3000).toFixed(2)).toBe('10000.00');
    // What 2dp would have produced, kept here so the regression is visible if
    // anyone ever narrows the column back.
    expect(line.unitCost.toDecimalPlaces(2).times(3000).toFixed(2)).toBe(
      '9990.00',
    );
  });

  it('is exact when the purchase unit IS the stock unit (factor 1)', () => {
    const line = normalizePurchaseLine({
      purchaseQuantity: d('2.0000'),
      conversionFactor: d('1'),
      lineTotal: d('170000.00'),
    });

    expect(line.quantity.toFixed(4)).toBe('2.0000');
    expect(line.unitCost.toFixed(6)).toBe('85000.000000');
  });

  it('rounds the derived unit cost HALF_UP at the 6th decimal', () => {
    // 1,0000005 rounds up to 1,000001 (HALF_UP), not down.
    const line = normalizePurchaseLine({
      purchaseQuantity: d('2'),
      conversionFactor: d('1000000'),
      lineTotal: d('2000001.00'),
    });

    expect(line.quantity.toFixed(4)).toBe('2000000.0000');
    expect(line.unitCost.toFixed(6)).toBe('1.000001');
  });

  it('preserves the bought figures untouched alongside the derived ones', () => {
    const line = normalizePurchaseLine({
      purchaseQuantity: d('1.5000'),
      conversionFactor: d('10'),
      lineTotal: d('67500.00'),
    });

    expect(line.purchaseQuantity.toFixed(4)).toBe('1.5000');
    expect(line.conversionFactor.toFixed(4)).toBe('10.0000');
    expect(line.lineTotal.toFixed(2)).toBe('67500.00');
  });

  it('throws rather than dividing by zero when the conversion collapses', () => {
    // Unreachable through the API — Zod refuses both inputs at zero — but the
    // alternative to throwing is writing Infinity into a Decimal column.
    expect(() =>
      normalizePurchaseLine({
        purchaseQuantity: d('1'),
        conversionFactor: d('0'),
        lineTotal: d('45000.00'),
      }),
    ).toThrow(ZeroNormalizedQuantityException);
  });

  it('handles 18-digit boundary arithmetic accurately using Prisma.Decimal', () => {
    const line = normalizePurchaseLine({
      purchaseQuantity: d('9999999999.9999'),
      conversionFactor: d('1'),
      lineTotal: d('99999999899999000.00'),
    });

    expect(line.quantity instanceof Prisma.Decimal).toBe(true);
    expect(line.quantity.toFixed(4)).toBe('9999999999.9999');
  });
});

describe('Purchase total (calculatePurchaseTotal)', () => {
  it('sums the line totals the user entered, without multiplying anything', () => {
    const total = calculatePurchaseTotal([d('170000.00'), d('120000.00')]);
    expect(total.toFixed(2)).toBe('290000.00');
  });

  it('equals the sum of the values actually stored on the lines', () => {
    // Since ADR-024 each lineTotal IS the input, so there is no per-line
    // rounding step left for the total to disagree with.
    const lineTotals = [d('333.30'), d('123.44')];
    expect(calculatePurchaseTotal(lineTotals).toFixed(2)).toBe('456.74');
  });

  it('returns 0.00 for empty line lists without throwing', () => {
    expect(calculatePurchaseTotal([]).toFixed(2)).toBe('0.00');
  });
});
