/**
 * OhMyPos — unit tests for report period resolution (ADR-018, plan §6.4).
 *
 * The partial-month case and the boundary arithmetic are the whole point: every
 * one of the five reports inherits whatever this file gets wrong.
 */
import { InvalidReportRangeException } from './errors/invalid-report-range.error';
import {
  MAX_REPORT_RANGE_DAYS,
  REPORT_TIMEZONE,
  eachWibDay,
  resolveReportRange,
} from './period';

describe('Report period (period.ts)', () => {
  describe('resolveReportRange', () => {
    it('resolves a partial month to a half-open UTC range', () => {
      const range = resolveReportRange('2025-03-05', '2025-03-15');
      expect(range.from.toISOString()).toBe('2025-03-04T17:00:00.000Z');
      expect(range.to.toISOString()).toBe('2025-03-15T17:00:00.000Z');
      expect(range.dayCount).toBe(11);
    });

    it('resolves a single day to exactly 24 hours', () => {
      const range = resolveReportRange('2025-03-05', '2025-03-05');
      expect(range.dayCount).toBe(1);
      expect(range.to.getTime() - range.from.getTime()).toBe(86_400_000);
    });

    it('crosses a month boundary', () => {
      const range = resolveReportRange('2025-03-25', '2025-04-05');
      expect(range.dayCount).toBe(12);
      expect(range.to.toISOString()).toBe('2025-04-05T17:00:00.000Z');
    });

    it('crosses a year boundary', () => {
      const range = resolveReportRange('2026-12-28', '2027-01-03');
      expect(range.dayCount).toBe(7);
    });

    it('covers a leap day', () => {
      const range = resolveReportRange('2028-02-28', '2028-03-01');
      expect(range.dayCount).toBe(3);
    });

    it('rejects an endDate before the startDate', () => {
      expect(() => resolveReportRange('2025-03-15', '2025-03-05')).toThrow(
        InvalidReportRangeException,
      );
    });

    it('rejects a malformed date', () => {
      expect(() => resolveReportRange('2025-3-5', '2025-03-15')).toThrow(
        InvalidReportRangeException,
      );
    });

    it('rejects a date that does not exist', () => {
      expect(() => resolveReportRange('2025-02-30', '2025-03-15')).toThrow(
        InvalidReportRangeException,
      );
    });

    it(`accepts exactly ${MAX_REPORT_RANGE_DAYS} days and rejects one more`, () => {
      // 2024 is a leap year: 2024-01-01 .. 2024-12-31 inclusive is 366 days.
      expect(resolveReportRange('2024-01-01', '2024-12-31').dayCount).toBe(366);
      expect(() => resolveReportRange('2024-01-01', '2025-01-01')).toThrow(
        InvalidReportRangeException,
      );
    });
  });

  describe('eachWibDay', () => {
    it('yields every day inclusive, in ascending order', () => {
      const days = eachWibDay(resolveReportRange('2025-03-05', '2025-03-08'));
      expect(days).toEqual([
        '2025-03-05',
        '2025-03-06',
        '2025-03-07',
        '2025-03-08',
      ]);
    });

    it('yields the WIB date across a month boundary', () => {
      const days = eachWibDay(resolveReportRange('2025-03-30', '2025-04-02'));
      expect(days).toEqual([
        '2025-03-30',
        '2025-03-31',
        '2025-04-01',
        '2025-04-02',
      ]);
    });

    it('yields exactly dayCount entries with no duplicates', () => {
      const range = resolveReportRange('2025-01-01', '2025-01-31');
      const days = eachWibDay(range);
      expect(days).toHaveLength(range.dayCount);
      expect(new Set(days).size).toBe(range.dayCount);
    });
  });

  it('pins the timezone constant — changing it changes every report', () => {
    expect(REPORT_TIMEZONE).toBe('Asia/Jakarta');
  });
});
