/**
 * OhMyPos — unit tests for the opening-stock delta calculator (Phase 6 plan
 * §3.2, §12.1).
 *
 * The mid-period and correction cases are the two traps this phase can ship
 * silently wrong (plan §11.10 traps 1 and 2). They are asserted here, with no
 * database, rather than left to the e2e suite alone.
 */
import { Prisma } from '../../generated/prisma/client';
import { computeOpeningDeltas } from './opening-stock.calculator';

const d = (value: string) => new Prisma.Decimal(value);

describe('Opening Stock Delta Calculator (opening-stock.calculator.ts)', () => {
  it('declares onto an empty ledger: the delta is the declared quantity', () => {
    const [result] = computeOpeningDeltas([
      {
        rawMaterialId: 'm1',
        declaredQuantity: d('50.0000'),
        carryForward: d('0'),
        existingOpeningDelta: d('0'),
        currentStock: d('0'),
      },
    ]);

    expect(result.delta.toFixed(4)).toBe('50.0000');
    expect(result.direction).toBe('IN');
    expect(result.quantity.toFixed(4)).toBe('50.0000');
    expect(result.resultingStock.toFixed(4)).toBe('50.0000');
  });

  it('declares BELOW the carry-forward: a negative delta becomes an OUT movement', () => {
    const [result] = computeOpeningDeltas([
      {
        rawMaterialId: 'm1',
        declaredQuantity: d('90.0000'),
        carryForward: d('100.0000'),
        existingOpeningDelta: d('0'),
        currentStock: d('100.0000'),
      },
    ]);

    expect(result.delta.toFixed(4)).toBe('-10.0000');
    expect(result.direction).toBe('OUT');
    // quantity is magnitude only — the sign lives in `direction`.
    expect(result.quantity.toFixed(4)).toBe('10.0000');
    expect(result.resultingStock.toFixed(4)).toBe('90.0000');
  });

  it('TRAP 1: a mid-period declaration is measured against carry-forward, not currentStock', () => {
    // Carry-forward 100, 20 already sold inside the period (currentStock 80),
    // owner declares the month opened at 90. The correction is −10, NOT +10,
    // and the resulting balance is 70 — the month's own sales carry through.
    const [result] = computeOpeningDeltas([
      {
        rawMaterialId: 'm1',
        declaredQuantity: d('90.0000'),
        carryForward: d('100.0000'),
        existingOpeningDelta: d('0'),
        currentStock: d('80.0000'),
      },
    ]);

    expect(result.delta.toFixed(4)).toBe('-10.0000');
    expect(result.resultingStock.toFixed(4)).toBe('70.0000');
  });

  it('TRAP 2: a correction is measured against the ACCUMULATED opening delta', () => {
    // First declaration was 90 against a carry-forward of 100, so the ledger
    // already holds an OPENING movement of −10. Correcting to 95 must write +5.
    const [result] = computeOpeningDeltas([
      {
        rawMaterialId: 'm1',
        declaredQuantity: d('95.0000'),
        carryForward: d('100.0000'),
        existingOpeningDelta: d('-10.0000'),
        currentStock: d('90.0000'),
      },
    ]);

    expect(result.delta.toFixed(4)).toBe('5.0000');
    expect(result.direction).toBe('IN');
    expect(result.resultingStock.toFixed(4)).toBe('95.0000');
  });

  it('a third correction still lands exactly on the declared number', () => {
    // Ledger holds −10 then +5, so existingOpeningDelta is −5 and the opening
    // currently reads 95. Declaring 80 must write −15.
    const [result] = computeOpeningDeltas([
      {
        rawMaterialId: 'm1',
        declaredQuantity: d('80.0000'),
        carryForward: d('100.0000'),
        existingOpeningDelta: d('-5.0000'),
        currentStock: d('95.0000'),
      },
    ]);

    expect(result.delta.toFixed(4)).toBe('-15.0000');
    expect(result.resultingStock.toFixed(4)).toBe('80.0000');
  });

  it('re-declaring the same number is a zero delta, still emitted as an IN', () => {
    const [result] = computeOpeningDeltas([
      {
        rawMaterialId: 'm1',
        declaredQuantity: d('35.0000'),
        carryForward: d('0'),
        existingOpeningDelta: d('35.0000'),
        currentStock: d('35.0000'),
      },
    ]);

    expect(result.delta.toFixed(4)).toBe('0.0000');
    expect(result.direction).toBe('IN');
    expect(result.quantity.toFixed(4)).toBe('0.0000');
  });

  it('declaring zero against a carry-forward wipes the balance', () => {
    const [result] = computeOpeningDeltas([
      {
        rawMaterialId: 'm1',
        declaredQuantity: d('0.0000'),
        carryForward: d('30.0000'),
        existingOpeningDelta: d('0'),
        currentStock: d('30.0000'),
      },
    ]);

    expect(result.delta.toFixed(4)).toBe('-30.0000');
    expect(result.resultingStock.toFixed(4)).toBe('0.0000');
  });

  it('reports a negative resulting stock rather than clamping it', () => {
    const [result] = computeOpeningDeltas([
      {
        rawMaterialId: 'm1',
        declaredQuantity: d('0.0000'),
        carryForward: d('100.0000'),
        existingOpeningDelta: d('0'),
        currentStock: d('5.0000'),
      },
    ]);

    expect(result.resultingStock.toFixed(4)).toBe('-95.0000');
    expect(result.resultingStock.isNegative()).toBe(true);
  });

  it('returns entries sorted ascending by rawMaterialId regardless of input order (ADR-016)', () => {
    const base = {
      declaredQuantity: d('1.0000'),
      carryForward: d('0'),
      existingOpeningDelta: d('0'),
      currentStock: d('0'),
    };
    const result = computeOpeningDeltas([
      { rawMaterialId: 'c-material', ...base },
      { rawMaterialId: 'a-material', ...base },
      { rawMaterialId: 'b-material', ...base },
    ]);

    expect(result.map((r) => r.rawMaterialId)).toEqual([
      'a-material',
      'b-material',
      'c-material',
    ]);
  });

  it('returns an empty array for an empty input, without throwing', () => {
    expect(computeOpeningDeltas([])).toEqual([]);
  });
});
