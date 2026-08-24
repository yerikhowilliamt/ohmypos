/**
 * OhMyPos — unit tests for the stock status badge (PRD §5.6, Phase 6 plan §12.1).
 *
 * Every row here is a boundary. The two that matter most: closing exactly AT
 * the threshold must read LOW (a threshold is the level at which the owner
 * wants warning, so reaching it must warn), and closing exactly 0 must read OUT
 * even when the threshold is its 0 default.
 */
import { Prisma } from '../../generated/prisma/client';
import { resolveStockStatus } from './stock-status';

describe('Stock Status (stock-status.ts)', () => {
  it.each([
    ['0.0000', '0.0000', 'OUT'],
    ['0.0001', '0.0000', 'OK'],
    ['10.0000', '10.0000', 'LOW'],
    ['10.0001', '10.0000', 'OK'],
    ['9.9999', '10.0000', 'LOW'],
    ['0.0000', '10.0000', 'OUT'],
    ['-5.0000', '10.0000', 'OUT'],
    ['1000.0000', '0.0000', 'OK'],
  ])(
    'closing %s against threshold %s is %s',
    (closing, threshold, expected) => {
      expect(
        resolveStockStatus(
          new Prisma.Decimal(closing),
          new Prisma.Decimal(threshold),
        ),
      ).toBe(expected);
    },
  );
});
