/**
 * OhMyPos — unit tests for the sale stock fan-out calculator (ADR-007, ADR-015,
 * ADR-016, plan §10.7 Tier 1).
 *
 * The lock-ordering test is the one that pins ADR-016 without a database: it
 * is what the e2e concurrency case (plan §10.7 case 8) would otherwise be the
 * only thing proving.
 */
import { Prisma } from '../../generated/prisma/client';
import { aggregateStockRequirements } from './sale-stock.calculator';

describe('Sale Stock Fan-Out Calculator (sale-stock.calculator.ts)', () => {
  it('aggregates a single product with a single recipe item', () => {
    const result = aggregateStockRequirements([
      {
        quantity: new Prisma.Decimal('2.0000'),
        recipeItems: [
          { rawMaterialId: 'gula', quantityUsed: new Prisma.Decimal('0.2500') },
        ],
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].rawMaterialId).toBe('gula');
    expect(result[0].quantity.toFixed(4)).toBe('0.5000');
  });

  it('sums a raw material shared across two different products in the cart', () => {
    // Es Kopi Susu (qty 2, uses 0.2500 Gula) + Teh Manis (qty 1, uses 0.1000 Gula)
    const result = aggregateStockRequirements([
      {
        quantity: new Prisma.Decimal('2.0000'),
        recipeItems: [
          { rawMaterialId: 'gula', quantityUsed: new Prisma.Decimal('0.2500') },
        ],
      },
      {
        quantity: new Prisma.Decimal('1.0000'),
        recipeItems: [
          { rawMaterialId: 'gula', quantityUsed: new Prisma.Decimal('0.1000') },
        ],
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].rawMaterialId).toBe('gula');
    // 2 × 0.2500 + 1 × 0.1000 = 0.6000
    expect(result[0].quantity.toFixed(4)).toBe('0.6000');
  });

  it('collapses the same product appearing on two lines into one requirement', () => {
    const line = {
      quantity: new Prisma.Decimal('1.0000'),
      recipeItems: [
        { rawMaterialId: 'kopi', quantityUsed: new Prisma.Decimal('0.0180') },
      ],
    };
    const result = aggregateStockRequirements([line, line]);

    expect(result).toHaveLength(1);
    expect(result[0].quantity.toFixed(4)).toBe('0.0360');
  });

  it('sums EXACT contributions then rounds ONCE — not per-line rounding', () => {
    // quantityUsed 0.0333, two lines of quantity 1.5000 each.
    // Round-per-line:  1.5000 × 0.0333 = 0.04995 -> 0.0500, twice -> 0.1000
    // Sum-then-round:  0.04995 + 0.04995 = 0.09990 -> 0.0999  <- correct
    const line = {
      quantity: new Prisma.Decimal('1.5000'),
      recipeItems: [
        { rawMaterialId: 'x', quantityUsed: new Prisma.Decimal('0.0333') },
      ],
    };
    const result = aggregateStockRequirements([line, line]);

    expect(result).toHaveLength(1);
    expect(result[0].quantity.toFixed(4)).toBe('0.0999');
  });

  it('returns entries sorted ascending by rawMaterialId regardless of input order (ADR-016)', () => {
    // Materials sort as a < b < c; fed in order c, a, b to prove the sort, not
    // the insertion order, determines the returned (and therefore lock) order.
    const result = aggregateStockRequirements([
      {
        quantity: new Prisma.Decimal('1.0000'),
        recipeItems: [
          {
            rawMaterialId: 'c-material',
            quantityUsed: new Prisma.Decimal('1.0000'),
          },
        ],
      },
      {
        quantity: new Prisma.Decimal('1.0000'),
        recipeItems: [
          {
            rawMaterialId: 'a-material',
            quantityUsed: new Prisma.Decimal('1.0000'),
          },
        ],
      },
      {
        quantity: new Prisma.Decimal('1.0000'),
        recipeItems: [
          {
            rawMaterialId: 'b-material',
            quantityUsed: new Prisma.Decimal('1.0000'),
          },
        ],
      },
    ]);

    expect(result.map((r) => r.rawMaterialId)).toEqual([
      'a-material',
      'b-material',
      'c-material',
    ]);
  });

  it('returns an empty array for a cart with no lines, without throwing', () => {
    expect(aggregateStockRequirements([])).toEqual([]);
  });
});
