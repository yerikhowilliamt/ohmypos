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
