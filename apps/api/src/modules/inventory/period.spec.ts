/**
 * OhMyPos — unit tests for calendar-period resolution (Phase 6 plan §9, §12.1).
 */
import {
  assertPeriodHasStarted,
  formatPeriodDate,
  formatPeriodMonth,
  parsePeriodMonth,
} from './period';

describe('Period (period.ts)', () => {
  it('resolves a month to a UTC half-open interval', () => {
    const period = parsePeriodMonth('2026-08');
    expect(period.month).toBe('2026-08');
    expect(period.periodStart.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    // EXCLUSIVE — the first instant of September is NOT part of August.
    expect(period.periodEnd.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('rolls December over to the following January', () => {
    const period = parsePeriodMonth('2026-12');
    expect(period.periodEnd.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it.each([
    '2026-13',
    '2026-00',
    '2026-8',
    '26-08',
    '2026-08-01',
    '',
    'agustus',
  ])('rejects the malformed period %p', (input) => {
    expect(() => parsePeriodMonth(input)).toThrow();
  });

  it('rejects a period that has not started yet', () => {
    const period = parsePeriodMonth('2030-01');
    expect(() =>
      assertPeriodHasStarted(period, new Date('2026-08-16T00:00:00.000Z')),
    ).toThrow();
  });

  it('accepts the period that contains "now", including its first instant', () => {
    const period = parsePeriodMonth('2026-08');
    expect(() =>
      assertPeriodHasStarted(period, new Date('2026-08-01T00:00:00.000Z')),
    ).not.toThrow();
  });

  it('formats a stored Date back to its month and date strings', () => {
    const date = new Date('2026-08-01T00:00:00.000Z');
    expect(formatPeriodMonth(date)).toBe('2026-08');
    expect(formatPeriodDate(date)).toBe('2026-08-01');
  });
});
