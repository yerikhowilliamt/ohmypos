/**
 * OhMyPos — HPP calculator unit tests (ADR-005, ADR-013, Playbook §10).
 *
 * Exhaustive unit tests for pure `calculateHpp` arithmetic, decimal precision,
 * rounding rules, and empty recipe handling.
 */
import { Prisma } from '../../generated/prisma/client';
import { calculateHpp } from './hpp.calculator';

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
});
