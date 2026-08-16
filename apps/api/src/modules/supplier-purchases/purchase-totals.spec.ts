/**
 * OhMyPos — unit tests for the purchase totals calculator (ERD §3, plan §9.3, §9.10).
 *
 * The rule under test is the one most likely to be "harmonised" away by a later
 * reader: `lineTotal` is a stored `Decimal(18,2)` column, so each line rounds
 * HALF_UP to 2dp and `totalAmount` is the sum of those already-rounded values.
 * That is deliberately NOT `calculateHpp`'s round-once-at-the-end rule (ADR-005),
 * because nothing intermediate is stored there and everything is stored here.
 */
import { Prisma } from '../../generated/prisma/client';
import { calculateLineTotal, calculatePurchaseTotal } from './purchase-totals';

describe('Purchase Totals Calculator (purchase-totals.ts)', () => {
  it('calculates single-line exact product without rounding difference', () => {
    const line = {
      quantity: new Prisma.Decimal('2.0000'),
      unitCost: new Prisma.Decimal('85000.00'),
    };

    const lineTotal = calculateLineTotal(line);
    expect(lineTotal.toFixed(2)).toBe('170000.00');

    const total = calculatePurchaseTotal([lineTotal]);
    expect(total.toFixed(2)).toBe('170000.00');
  });

  it('calculates multi-line sum accurately matching hand-computed totals', () => {
    const line1 = calculateLineTotal({
      quantity: new Prisma.Decimal('2.0000'),
      unitCost: new Prisma.Decimal('85000.00'),
    }); // 170000.00
    const line2 = calculateLineTotal({
      quantity: new Prisma.Decimal('10.0000'),
      unitCost: new Prisma.Decimal('12000.00'),
    }); // 120000.00

    const total = calculatePurchaseTotal([line1, line2]);
    expect(total.toFixed(2)).toBe('290000.00');
  });

  it('proves per-line HALF_UP rounding and sums the rounded line totals', () => {
    // 0.3333 × 1000.00 = 333.3000 -> 333.30
    const line1 = calculateLineTotal({
      quantity: new Prisma.Decimal('0.3333'),
      unitCost: new Prisma.Decimal('1000.00'),
    });
    expect(line1.toFixed(2)).toBe('333.30');

    // 1.2345 × 99.99 = 123.437655 -> 123.44 (HALF_UP)
    const line2 = calculateLineTotal({
      quantity: new Prisma.Decimal('1.2345'),
      unitCost: new Prisma.Decimal('99.99'),
    });
    expect(line2.toFixed(2)).toBe('123.44');

    // Sum of rounded: 333.30 + 123.44 = 456.74
    // (Note: unrounded exact sum would be 333.30 + 123.437655 = 456.737655 -> 456.74, but let's test where they differ)
    const total = calculatePurchaseTotal([line1, line2]);
    expect(total.toFixed(2)).toBe('456.74');

    // Another example where per-line rounding vs sum-then-round differs:
    // Line A: 1.0000 × 0.004 = 0.004 -> rounded 0.00
    // Line B: 1.0000 × 0.004 = 0.004 -> rounded 0.00
    // Line C: 1.0000 × 0.004 = 0.004 -> rounded 0.00
    // Sum of rounded = 0.00. Unrounded sum = 0.012 -> rounded 0.01.
    const micro1 = calculateLineTotal({
      quantity: new Prisma.Decimal('1.0000'),
      unitCost: new Prisma.Decimal('0.004'),
    });
    const micro2 = calculateLineTotal({
      quantity: new Prisma.Decimal('1.0000'),
      unitCost: new Prisma.Decimal('0.004'),
    });
    const micro3 = calculateLineTotal({
      quantity: new Prisma.Decimal('1.0000'),
      unitCost: new Prisma.Decimal('0.004'),
    });

    expect(micro1.toFixed(2)).toBe('0.00');
    expect(micro2.toFixed(2)).toBe('0.00');
    expect(micro3.toFixed(2)).toBe('0.00');

    const microTotal = calculatePurchaseTotal([micro1, micro2, micro3]);
    expect(microTotal.toFixed(2)).toBe('0.00');
  });

  it('handles 18-digit boundary arithmetic accurately using Prisma.Decimal', () => {
    const line = calculateLineTotal({
      quantity: new Prisma.Decimal('9999999999.9999'),
      unitCost: new Prisma.Decimal('9999999.99'),
    });

    // 9999999999.9999 × 9999999.99 = 99999999899999000.000001 -> 99999999899999000.00
    expect(line instanceof Prisma.Decimal).toBe(true);
    expect(line.toFixed(2)).toBe('99999999899999000.00');
  });

  it('returns 0.00 for empty line lists without throwing', () => {
    const total = calculatePurchaseTotal([]);
    expect(total.toFixed(2)).toBe('0.00');
  });
});
