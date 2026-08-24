/**
 * OhMyPos — Inventory Summary arithmetic (PRD §5.6, ADR-004, ADR-008,
 * Phase 6 plan §2.1, §4.1).
 *
 * Pure — no Prisma client, no Nest DI, no database. This file is the entire
 * arithmetic of Dashboard 5, kept out of the service so the identity below can
 * be hammered by unit tests with no database at all.
 *
 * The identity every row must satisfy:
 *
 *   closing = opening + in − out
 *           ≡ Σ signed(movement) over every movement dated before periodEnd
 *
 * where opening = carryForward (everything strictly before periodStart)
 *                 + this period's OPENING movements.
 *
 * Bucketing is by DIRECTION, not by referenceType (plan §4.1). In v1 the two
 * are provably equal — PURCHASE is the only other IN writer, SALE the only OUT
 * writer, ADJUSTMENT has no writer — but they diverge the moment an ADJUSTMENT
 * writer appears, and under referenceType bucketing that adjustment would fall
 * into NO bucket and silently break the identity. Under direction bucketing it
 * lands in `in` or `out` and the identity survives.
 *
 * No rounding happens anywhere in this file, deliberately. Every input is
 * already Decimal(18,4) and Decimal addition of 4dp values is exact; a
 * toDecimalPlaces call here is the one thing that could make the identity fail
 * by a hair, which is the hardest kind of failure to notice.
 */
import type { StockStatus } from '@ohmypos/api-contracts';
import { Prisma } from '../../generated/prisma/client';
import { resolveStockStatus } from './stock-status';

export interface SummaryMaterial {
  id: string;
  name: string;
  unit: string;
  lowStockThreshold: Prisma.Decimal;
}

/** A `groupBy` row over movements strictly before `periodStart`. */
export interface SignedBucket {
  rawMaterialId: string;
  direction: 'IN' | 'OUT';
  quantity: Prisma.Decimal;
}

/** A `groupBy` row over movements inside the period. */
export interface PeriodBucket extends SignedBucket {
  referenceType: 'SALE' | 'PURCHASE' | 'OPENING' | 'ADJUSTMENT';
}

export interface InventorySummaryEntry {
  rawMaterialId: string;
  name: string;
  unit: string;
  opening: Prisma.Decimal;
  in: Prisma.Decimal;
  out: Prisma.Decimal;
  closing: Prisma.Decimal;
  lowStockThreshold: Prisma.Decimal;
  status: StockStatus;
}

function zero(): Prisma.Decimal {
  // A fresh instance per call: Prisma.Decimal is immutable, but sharing one
  // module-level constant across two maps invites an accidental mutation in
  // any future edit that stops being immutable.
  return new Prisma.Decimal(0);
}

/**
 * Nets a bucket list into one signed total per raw material: IN adds, OUT
 * subtracts. Exported because the opening-stock flow needs the identical
 * netting for its carry-forward, and two copies of it is two places to get the
 * sign wrong.
 */
export function sumSignedByMaterial(
  buckets: SignedBucket[],
): Map<string, Prisma.Decimal> {
  const totals = new Map<string, Prisma.Decimal>();

  for (const bucket of buckets) {
    const running = totals.get(bucket.rawMaterialId) ?? zero();
    totals.set(
      bucket.rawMaterialId,
      bucket.direction === 'IN'
        ? running.plus(bucket.quantity)
        : running.minus(bucket.quantity),
    );
  }

  return totals;
}

export function assembleInventorySummary(
  materials: SummaryMaterial[],
  prior: SignedBucket[],
  period: PeriodBucket[],
): InventorySummaryEntry[] {
  const carryForward = sumSignedByMaterial(prior);

  const openingDelta = sumSignedByMaterial(
    period.filter((bucket) => bucket.referenceType === 'OPENING'),
  );

  const inTotals = new Map<string, Prisma.Decimal>();
  const outTotals = new Map<string, Prisma.Decimal>();
  for (const bucket of period) {
    if (bucket.referenceType === 'OPENING') {
      continue;
    }
    const totals = bucket.direction === 'IN' ? inTotals : outTotals;
    const running = totals.get(bucket.rawMaterialId) ?? zero();
    totals.set(bucket.rawMaterialId, running.plus(bucket.quantity));
  }

  return materials.map((material) => {
    const opening = (carryForward.get(material.id) ?? zero()).plus(
      openingDelta.get(material.id) ?? zero(),
    );
    const inQuantity = inTotals.get(material.id) ?? zero();
    const outQuantity = outTotals.get(material.id) ?? zero();
    const closing = opening.plus(inQuantity).minus(outQuantity);

    return {
      rawMaterialId: material.id,
      name: material.name,
      unit: material.unit,
      opening,
      in: inQuantity,
      out: outQuantity,
      closing,
      lowStockThreshold: material.lowStockThreshold,
      status: resolveStockStatus(closing, material.lowStockThreshold),
    };
  });
}
