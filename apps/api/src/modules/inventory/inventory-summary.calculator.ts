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
  return new Prisma.Decimal(0);
}

/** Nets buckets into one signed total per raw material: IN adds, OUT subtracts. */
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

/**
 * Builds one summary row per material satisfying
 * `closing = opening + in − out`.
 *
 * Buckets by direction, not referenceType, and never rounds; see `README.md`.
 */
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
