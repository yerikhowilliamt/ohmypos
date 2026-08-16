/**
 * OhMyPos — unit tests for the sale totals calculator (ERD §3, ADR-005, ADR-015, plan §10.7 Tier 1).
 *
 * Two rules under test that are easy to "harmonise" the wrong way:
 * - `lineTotal` rounds per line and sums the rounded values (like purchase-totals.ts).
 * - `totalHpp` sums exact products and rounds ONCE at the end (like hpp.calculator.ts) —
 *   the opposite rule, for the opposite reason: nothing intermediate is stored there.
 */
import { Prisma } from '../../generated/prisma/client';
import {
  calculateSaleLineTotal,
  calculateSaleTotal,
  calculateTotalHpp,
  resolveUnitPrice,
} from './sale-totals';

describe('Sale Totals Calculator (sale-totals.ts)', () => {
  describe('resolveUnitPrice', () => {
    it('uses the master price when no override is supplied', () => {
      const result = resolveUnitPrice({
        masterPrice: new Prisma.Decimal('18000.00'),
      });
      expect(result.unitPriceAtSale.toFixed(2)).toBe('18000.00');
      expect(result.isPriceOverridden).toBe(false);
    });

    it('flags an override that differs from the master price', () => {
      const result = resolveUnitPrice({
        override: new Prisma.Decimal('15000.00'),
        masterPrice: new Prisma.Decimal('18000.00'),
      });
      expect(result.unitPriceAtSale.toFixed(2)).toBe('15000.00');
      expect(result.isPriceOverridden).toBe(true);
    });

    it('does NOT flag an override that equals the master price', () => {
      const result = resolveUnitPrice({
        override: new Prisma.Decimal('18000.00'),
        masterPrice: new Prisma.Decimal('18000.00'),
      });
      expect(result.unitPriceAtSale.toFixed(2)).toBe('18000.00');
      expect(result.isPriceOverridden).toBe(false);
    });
  });

  describe('calculateSaleLineTotal / calculateSaleTotal', () => {
    it('calculates a single line exactly', () => {
      const lineTotal = calculateSaleLineTotal({
        quantity: new Prisma.Decimal('2.0000'),
        unitPrice: new Prisma.Decimal('18000.00'),
      });
      expect(lineTotal.toFixed(2)).toBe('36000.00');

      const total = calculateSaleTotal([lineTotal]);
      expect(total.toFixed(2)).toBe('36000.00');
    });

    it('rounds a fractional line HALF_UP to 2dp', () => {
      // 0.5000 × 7333.33 = 3666.665 -> 3666.67 (HALF_UP)
      const lineTotal = calculateSaleLineTotal({
        quantity: new Prisma.Decimal('0.5000'),
        unitPrice: new Prisma.Decimal('7333.33'),
      });
      expect(lineTotal.toFixed(2)).toBe('3666.67');
    });

    it('sums ALREADY-ROUNDED line totals, which differs from rounding the exact sum', () => {
      // Two lines of the same fractional case: exact 3666.665 each.
      // Per-line rounding: 3666.665 -> 3666.67 (HALF_UP), twice -> 7333.34.
      // Rounding the exact sum instead: 3666.665 + 3666.665 = 7333.33 exactly -> 7333.33.
      // These differ, which is the point of the test.
      const line1 = calculateSaleLineTotal({
        quantity: new Prisma.Decimal('0.5000'),
        unitPrice: new Prisma.Decimal('7333.33'),
      });
      const line2 = calculateSaleLineTotal({
        quantity: new Prisma.Decimal('0.5000'),
        unitPrice: new Prisma.Decimal('7333.33'),
      });
      expect(line1.toFixed(2)).toBe('3666.67');
      expect(line2.toFixed(2)).toBe('3666.67');

      const total = calculateSaleTotal([line1, line2]);
      expect(total.toFixed(2)).toBe('7333.34');
    });

    it('returns 0.00 for an empty line list without throwing', () => {
      const total = calculateSaleTotal([]);
      expect(total.toFixed(2)).toBe('0.00');
    });
  });

  describe('calculateTotalHpp', () => {
    it('calculates the per-unit HPP times quantity, summed', () => {
      // Es Kopi Susu fixture: hppAtSale 4530.00, quantity 2 -> 9060.00
      const total = calculateTotalHpp([
        {
          hppAtSale: new Prisma.Decimal('4530.00'),
          quantity: new Prisma.Decimal('2.0000'),
        },
      ]);
      expect(total.toFixed(2)).toBe('9060.00');
    });

    it('rounds ONCE at the end, not per line — proof the two rules differ', () => {
      // Three lines whose exact product is 0.0333 each: per-line rounding would
      // give 0.03 × 3 = 0.09; summing exact first gives 0.0999 -> rounds to 0.10.
      const lines = [
        {
          hppAtSale: new Prisma.Decimal('0.0333'),
          quantity: new Prisma.Decimal('1.0000'),
        },
        {
          hppAtSale: new Prisma.Decimal('0.0333'),
          quantity: new Prisma.Decimal('1.0000'),
        },
        {
          hppAtSale: new Prisma.Decimal('0.0333'),
          quantity: new Prisma.Decimal('1.0000'),
        },
      ];
      const total = calculateTotalHpp(lines);
      expect(total.toFixed(2)).toBe('0.10');
    });

    it('returns 0.00 for an empty line list without throwing', () => {
      const total = calculateTotalHpp([]);
      expect(total.toFixed(2)).toBe('0.00');
    });
  });
});
