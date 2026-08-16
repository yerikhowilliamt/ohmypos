/**
 * OhMyPos — Dashboard 5's automatic stock badge (PRD §5.6, Phase 6 plan §11.8.2).
 *
 * Pure — no Prisma client, no Nest DI, no database.
 *
 * Order matters and is not interchangeable: OUT is checked FIRST, so an empty
 * bin reads OUT rather than LOW even when `lowStockThreshold` is its 0 default.
 * "At the threshold" is LOW, not OK — a threshold is the level at which the
 * owner wants to be warned, so reaching it must warn.
 */
import type { StockStatus } from '@ohmypos/api-contracts';
import { Prisma } from '../../generated/prisma/client';

export function resolveStockStatus(
  closing: Prisma.Decimal,
  lowStockThreshold: Prisma.Decimal,
): StockStatus {
  // A negative closing balance should be unreachable (ADR-007 blocks the sale
  // that would cause it). If one ever appears, it must not read as LOW.
  if (closing.lessThanOrEqualTo(0)) {
    return 'OUT';
  }
  if (closing.lessThanOrEqualTo(lowStockThreshold)) {
    return 'LOW';
  }
  return 'OK';
}
