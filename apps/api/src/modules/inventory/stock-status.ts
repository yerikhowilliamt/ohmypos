import type { StockStatus } from '@ohmypos/api-contracts';
import { Prisma } from '../../generated/prisma/client';

/**
 * Maps a closing balance to the Dashboard 5 badge. `OUT` is checked first;
 * reaching the threshold exactly counts as `LOW`.
 */
export function resolveStockStatus(
  closing: Prisma.Decimal,
  lowStockThreshold: Prisma.Decimal,
): StockStatus {
  // A negative balance should be unreachable (ADR-007), but must never read as LOW.
  if (closing.lessThanOrEqualTo(0)) {
    return 'OUT';
  }
  if (closing.lessThanOrEqualTo(lowStockThreshold)) {
    return 'LOW';
  }
  return 'OK';
}
