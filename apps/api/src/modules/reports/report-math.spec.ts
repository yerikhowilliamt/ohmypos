/**
 * OhMyPos — unit tests for the report math helpers (plan §6.8).
 */
import { Prisma } from '../../generated/prisma/client';
import {
  averagePerDay,
  fillDailyGaps,
  nullToZero,
  percentageOf,
  sumDecimals,
} from './report-math';

const d = (v: string) => new Prisma.Decimal(v);

describe('Report math (report-math.ts)', () => {
  describe('nullToZero', () => {
    it('turns a NULL aggregate into 0.00', () => {
      expect(nullToZero(null).toFixed(2)).toBe('0.00');
    });

    it('passes a real value through untouched', () => {
      expect(nullToZero(d('123.45')).toFixed(2)).toBe('123.45');
    });
  });

  describe('percentageOf', () => {
    it('computes a margin to 2dp HALF_UP', () => {
      // 64000 / 102000 = 62.745098... -> 62.75
      expect(percentageOf(d('64000.00'), d('102000.00'))).toBe(62.75);
    });

    it('returns null — not NaN — when the denominator is zero', () => {
      expect(percentageOf(d('0.00'), d('0.00'))).toBeNull();
      expect(percentageOf(d('500.00'), d('0.00'))).toBeNull();
    });

    it('returns a negative percentage for a loss', () => {
      expect(percentageOf(d('-5000.00'), d('10000.00'))).toBe(-50);
    });
  });

  describe('averagePerDay', () => {
    it('divides by the day count in range, rounded 2dp', () => {
      // 102000 / 31 = 3290.3225806... -> 3290.32
      expect(averagePerDay(d('102000.00'), 31).toFixed(2)).toBe('3290.32');
    });

    it('returns 0.00 rather than dividing by zero', () => {
      expect(averagePerDay(d('100.00'), 0).toFixed(2)).toBe('0.00');
    });
  });

  describe('fillDailyGaps', () => {
    const days = ['2025-03-01', '2025-03-02', '2025-03-03'];

    it('inserts zero rows for days with no income, preserving order', () => {
      const filled = fillDailyGaps(days, [
        {
          date: '2025-03-02',
          income: d('50000.00'),
          entryCount: 2,
          cogs: d('20000.00'),
          operatingExpenses: d('5000.00'),
        },
      ]);
      expect(filled.map((r) => r.date)).toEqual(days);
      expect(filled.map((r) => r.income.toFixed(2))).toEqual([
        '0.00',
        '50000.00',
        '0.00',
      ]);
      expect(filled.map((r) => r.entryCount)).toEqual([0, 2, 0]);
      expect(filled.map((r) => r.cogs.toFixed(2))).toEqual([
        '0.00',
        '20000.00',
        '0.00',
      ]);
      expect(filled.map((r) => r.operatingExpenses.toFixed(2))).toEqual([
        '0.00',
        '5000.00',
        '0.00',
      ]);
    });

    it('returns one row per day even when nothing is present', () => {
      const filled = fillDailyGaps(days, []);
      expect(filled).toHaveLength(3);
      expect(filled.every((r) => r.income.isZero())).toBe(true);
      expect(filled.every((r) => r.cogs.isZero())).toBe(true);
      expect(filled.every((r) => r.operatingExpenses.isZero())).toBe(true);
    });
  });

  describe('sumDecimals', () => {
    it('sums exactly and returns 0 for an empty list', () => {
      expect(sumDecimals([d('1.01'), d('2.02')]).toFixed(2)).toBe('3.03');
      expect(sumDecimals([]).toFixed(2)).toBe('0.00');
    });
  });
});
