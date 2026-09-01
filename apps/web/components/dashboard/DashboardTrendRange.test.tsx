import { describe, expect, it } from 'vitest';
import { TREND_WINDOW_DAYS, trendWindowRange } from './DashboardClient';

const dayCount = (r: { startDate: string; endDate: string }) =>
  Math.round((Date.parse(r.endDate) - Date.parse(r.startDate)) / 86_400_000) +
  1;

/**
 * ERR-051 — the dashboard trend chart used the calendar month, which on the
 * 1st is a single day; a one-point line has no segment to draw, so the panel
 * rendered blank for that whole day. The window must never collapse again.
 */
describe('trendWindowRange', () => {
  it('spans a full window on the 1st of a month — the case that broke', () => {
    const range = trendWindowRange(new Date(2026, 8, 1));
    expect(range).toEqual({ startDate: '2026-08-03', endDate: '2026-09-01' });
    expect(dayCount(range)).toBe(TREND_WINDOW_DAYS);
  });

  it('spans a full window mid-month too', () => {
    expect(dayCount(trendWindowRange(new Date(2026, 8, 17)))).toBe(
      TREND_WINDOW_DAYS,
    );
  });

  it('crosses a year boundary without shrinking', () => {
    const range = trendWindowRange(new Date(2027, 0, 1));
    expect(range).toEqual({ startDate: '2026-12-03', endDate: '2027-01-01' });
    expect(dayCount(range)).toBe(TREND_WINDOW_DAYS);
  });

  it('never yields fewer than two points, on any day of any month', () => {
    for (let month = 0; month < 12; month++) {
      for (const day of [1, 2, 15, 28]) {
        expect(dayCount(trendWindowRange(new Date(2026, month, day)))).toBe(
          TREND_WINDOW_DAYS,
        );
      }
    }
  });
});
