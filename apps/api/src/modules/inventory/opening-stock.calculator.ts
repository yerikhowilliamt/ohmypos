/**
 * OhMyPos — opening-stock delta calculator (PRD §5.5, System Design §6.4,
 * ADR-016, Phase 6 plan §3.2).
 *
 * Pure — no Prisma client, no Nest DI, no database.
 *
 * An OpeningStock record is a DECLARATION of what was physically counted at the
 * start of the period. The ledger movement it produces is the SIGNED DIFFERENCE
 * between that count and what the ledger already says the period opened with:
 *
 *   delta = declared − ( carryForward + existingOpeningDelta )
 *
 * Two things about that formula are load-bearing and must not be "simplified":
 *
 * 1. It subtracts `carryForward` (movements strictly BEFORE periodStart), never
 *    `currentStock`. A declaration entered mid-month must reprice the START of
 *    the month and let that month's own sales and purchases carry through
 *    untouched. Using currentStock gives the right answer only when nothing has
 *    moved since periodStart — i.e. in exactly the case a casual test uses.
 *
 * 2. It subtracts `existingOpeningDelta`, the sum of OPENING movements ALREADY
 *    written for this period, not "the previously declared quantity". That is
 *    what makes a second, third and fourth correction all land on the declared
 *    number: the ledger is append-only (ERD §3), so a correction is another
 *    row, never an edit.
 *
 * Entries are returned sorted ascending by rawMaterialId, which fixes the lock
 * order (ADR-016) — the sort lives here, not in the service, so the ordering is
 * provable by a unit test with no database, exactly as in
 * sale-stock.calculator.ts.
 */
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
  /** |delta| — magnitude only; the sign lives in `direction`, as on every
   *  other StockMovement in the system. */
  quantity: Prisma.Decimal;
  /** currentStock + delta — the caller must reject this if it is negative. */
  resultingStock: Prisma.Decimal;
}

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
