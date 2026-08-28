/**
 * OhMyPos — HPP calculator unit tests (ADR-005, ADR-013, Playbook §10).
 *
 * Exhaustive unit tests for pure `calculateHpp` arithmetic, decimal precision,
 * rounding rules, and empty recipe handling.
 */
import { Prisma } from '../../generated/prisma/client';
import { calculateBaseHpp, calculateHpp } from './hpp.calculator';

describe('calculateHpp', () => {
  it('calculates exact arithmetic for a single item', () => {
    const items = [
      {
        quantityUsed: new Prisma.Decimal('2.5000'),
        unitCost: new Prisma.Decimal('12000.00'),
      },
    ];

    const result = calculateHpp(items);
    expect(result).not.toBeNull();
    expect(result?.toString()).toBe('30000');
    expect(result?.toFixed(2)).toBe('30000.00');
  });

  it('sums multiple recipe items correctly', () => {
    // Es Kopi Susu recipe fixture (§9.8)
    const items = [
      {
        quantityUsed: new Prisma.Decimal('0.2500'), // Gula
        unitCost: new Prisma.Decimal('12000.00'), // 3000.00
      },
      {
        quantityUsed: new Prisma.Decimal('0.0180'), // Kopi
        unitCost: new Prisma.Decimal('85000.00'), // 1530.00
      },
    ];

    const result = calculateHpp(items);
    expect(result?.toFixed(2)).toBe('4530.00');
  });

  it('rounds once at the end using HALF_UP, not per line item', () => {
    // Line 1: 0.005 * 1.00 = 0.005 (would round to 0.01 if rounded per line)
    // Line 2: 0.004 * 1.00 = 0.004 (would round to 0.00 if rounded per line)
    // Sum before rounding: 0.009 -> rounds to 0.01 HALF_UP.
    // If per line: 0.01 + 0.00 = 0.01.
    // Line 1: 0.004 * 1.00 = 0.004
    // Line 2: 0.004 * 1.00 = 0.004
    // Sum before rounding: 0.008 -> rounds to 0.01 HALF_UP.
    // If per line: 0.00 + 0.00 = 0.00 (would fail if rounded per line).
    const items = [
      {
        quantityUsed: new Prisma.Decimal('0.0040'),
        unitCost: new Prisma.Decimal('1.00'),
      },
      {
        quantityUsed: new Prisma.Decimal('0.0040'),
        unitCost: new Prisma.Decimal('1.00'),
      },
    ];

    const result = calculateHpp(items);
    expect(result?.toFixed(2)).toBe('0.01');
  });

  it('handles zero-cost raw material (unitCost = 0) without nulling or throwing', () => {
    const items = [
      {
        quantityUsed: new Prisma.Decimal('1.0000'),
        unitCost: new Prisma.Decimal('0.00'),
      },
    ];

    const result = calculateHpp(items);
    expect(result).not.toBeNull();
    expect(result?.toFixed(2)).toBe('0.00');
  });

  it('returns null (never 0) for an empty item list', () => {
    const result = calculateHpp([]);
    expect(result).toBeNull();
    expect(result).not.toBe(0);
    expect(result).not.toEqual(new Prisma.Decimal(0));
  });

  it('preserves 18-digit precision without float precision loss', () => {
    const items = [
      {
        quantityUsed: new Prisma.Decimal('9999999999.9999'),
        unitCost: new Prisma.Decimal('1.00'),
      },
    ];

    const result = calculateHpp(items);
    expect(result?.toFixed(2)).toBe('10000000000.00');
  });

  // ── Product waste allowance (ADR-024) ──────────────────────────────────────

  it('leaves HPP byte-identical at 0% waste, the migration default', () => {
    const items = [
      {
        quantityUsed: new Prisma.Decimal('0.2500'),
        unitCost: new Prisma.Decimal('12000.00'),
      },
      {
        quantityUsed: new Prisma.Decimal('0.0180'),
        unitCost: new Prisma.Decimal('85000.00'),
      },
    ];

    // Omitting the argument and passing an explicit zero must agree — every
    // pre-ADR-024 call site relies on the default.
    expect(calculateHpp(items)?.toFixed(2)).toBe('4530.00');
    expect(calculateHpp(items, new Prisma.Decimal('0'))?.toFixed(2)).toBe(
      '4530.00',
    );
  });

  it("applies the handoff's worked example: Rp7.923 base at 5% → Rp8.319,15", () => {
    const items = [
      {
        quantityUsed: new Prisma.Decimal('1.0000'),
        unitCost: new Prisma.Decimal('7923.00'),
      },
    ];

    const result = calculateHpp(items, new Prisma.Decimal('5.00'));
    expect(result?.toFixed(2)).toBe('8319.15');
  });

  it('accepts a fractional waste percentage', () => {
    const items = [
      {
        quantityUsed: new Prisma.Decimal('1.0000'),
        unitCost: new Prisma.Decimal('10000.00'),
      },
    ];

    // 10.000 × 1,075 = 10.750
    expect(calculateHpp(items, new Prisma.Decimal('7.50'))?.toFixed(2)).toBe(
      '10750.00',
    );
  });

  it('applies waste AFTER the sum, so how a recipe is split does not matter', () => {
    const oneLine = [
      {
        quantityUsed: new Prisma.Decimal('1.0000'),
        unitCost: new Prisma.Decimal('3333.33'),
      },
    ];
    const splitInThree = [
      {
        quantityUsed: new Prisma.Decimal('1.0000'),
        unitCost: new Prisma.Decimal('1111.11'),
      },
      {
        quantityUsed: new Prisma.Decimal('1.0000'),
        unitCost: new Prisma.Decimal('1111.11'),
      },
      {
        quantityUsed: new Prisma.Decimal('1.0000'),
        unitCost: new Prisma.Decimal('1111.11'),
      },
    ];

    const waste = new Prisma.Decimal('5.00');
    expect(calculateHpp(oneLine, waste)?.toFixed(2)).toBe(
      calculateHpp(splitInThree, waste)?.toFixed(2),
    );
  });

  it('rounds ONCE, after waste — never before it', () => {
    const items = [
      {
        quantityUsed: new Prisma.Decimal('1000.0000'),
        // The ADR-024 normalized-rate case: a 6dp cost per stock unit.
        unitCost: new Prisma.Decimal('0.004000'),
      },
    ];

    // Round-then-multiply would be 0,00 × 1.000 × 1,05 = 0,00.
    // Multiply-then-round is 1.000 × 0,004 = 4,00; × 1,05 = 4,20.
    expect(calculateHpp(items, new Prisma.Decimal('5'))?.toFixed(2)).toBe(
      '4.20',
    );
  });

  it('returns null for an empty recipe regardless of the waste percentage', () => {
    // "No recipe" stays a different fact from "costs nothing" (ADR-013), and a
    // waste percentage cannot conjure a cost out of no ingredients.
    expect(calculateHpp([], new Prisma.Decimal('25.00'))).toBeNull();
  });

  it('caps nothing at 100% — the bound is enforced at the contract edge', () => {
    const items = [
      {
        quantityUsed: new Prisma.Decimal('1.0000'),
        unitCost: new Prisma.Decimal('1000.00'),
      },
    ];
    expect(calculateHpp(items, new Prisma.Decimal('100.00'))?.toFixed(2)).toBe(
      '2000.00',
    );
  });
});

describe('calculateBaseHpp', () => {
  it('returns the pre-waste sum, unrounded', () => {
    const items = [
      {
        quantityUsed: new Prisma.Decimal('3000.0000'),
        unitCost: new Prisma.Decimal('3.333333'),
      },
    ];

    // Unrounded on purpose: calculateHpp needs this value before rounding so
    // the waste multiplication is not applied to an already-rounded figure.
    expect(calculateBaseHpp(items)?.toFixed(3)).toBe('9999.999');
  });

  it('returns null for an empty recipe, like calculateHpp', () => {
    expect(calculateBaseHpp([])).toBeNull();
  });

  it('is exactly the waste-free case of calculateHpp', () => {
    const items = [
      {
        quantityUsed: new Prisma.Decimal('0.2500'),
        unitCost: new Prisma.Decimal('12000.00'),
      },
    ];
    expect(calculateBaseHpp(items)?.toFixed(2)).toBe(
      calculateHpp(items)?.toFixed(2),
    );
  });
});
