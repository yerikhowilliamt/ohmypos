import { Prisma } from '../../generated/prisma/client';

export interface OpeningDeltaInput {
  rawMaterialId: string;
  /** What the user counted. */
  declaredQuantity: Prisma.Decimal;
  /** Σ signed movements dated strictly before periodStart. */
  carryForward: Prisma.Decimal;
  /** Σ signed OPENING movements already inside this period. */
  existingOpeningDelta: Prisma.Decimal;
  /** The material's running balance right now, across all time. */
  currentStock: Prisma.Decimal;
}

export interface OpeningDelta {
  rawMaterialId: string;
  /** SIGNED. Negative when the count came in below the ledger. */
  delta: Prisma.Decimal;
  direction: 'IN' | 'OUT';
  /** Magnitude only; the sign lives in `direction`. */
  quantity: Prisma.Decimal;
  /** currentStock + delta — the caller must reject this if it is negative. */
  resultingStock: Prisma.Decimal;
}

/**
 * Computes `delta = declared − (carryForward + existingOpeningDelta)` per entry,
 * sorted ascending by rawMaterialId (the lock order).
 *
 * Do not substitute `currentStock` for `carryForward`; see `README.md`.
 */
export function computeOpeningDeltas(
  inputs: OpeningDeltaInput[],
): OpeningDelta[] {
  return inputs
    .map((input) => {
      const currentOpening = input.carryForward.plus(
        input.existingOpeningDelta,
      );
      const delta = input.declaredQuantity.minus(currentOpening);

      return {
        rawMaterialId: input.rawMaterialId,
        delta,
        direction: delta.isNegative() ? ('OUT' as const) : ('IN' as const),
        quantity: delta.abs(),
        resultingStock: input.currentStock.plus(delta),
      };
    })
    .sort((a, b) => a.rawMaterialId.localeCompare(b.rawMaterialId));
}
