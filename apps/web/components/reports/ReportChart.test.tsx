import { describe, expect, it } from 'vitest';
import { lineDotFor } from './ReportChart';

/**
 * Regression guard for the blank dashboard chart: the range is
 * "start of month → today", so on the 1st of any month the daily-income series
 * has exactly one point. Recharts strokes segments between points, so that
 * series drew nothing, and `dot={false}` meant there was no marker either —
 * a real value rendered as an empty panel for the whole day.
 */
describe('lineDotFor', () => {
  it('shows a dot for a single-point series, which has no segment to stroke', () => {
    expect(lineDotFor(1)).toEqual({ r: 3 });
  });

  it('hides dots once there are segments to draw', () => {
    expect(lineDotFor(2)).toBe(false);
    expect(lineDotFor(31)).toBe(false);
  });

  it('hides dots for an empty series — ChartEmptyState covers that case', () => {
    expect(lineDotFor(0)).toBe(false);
  });
});
