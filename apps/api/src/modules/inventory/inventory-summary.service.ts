import { Injectable } from '@nestjs/common';
import type { InventorySummaryResponse } from '@ohmypos/api-contracts';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assembleInventorySummary } from './inventory-summary.calculator';
import { parsePeriodMonth } from './period';
import { InventorySummaryQueryDto } from './inventory-summary.dto';

/**
 * Prisma's 5s default times out under load at real volume (ERR-045). If 20s is
 * ever hit, fix the query or index; do not raise this further.
 */
const INVENTORY_SUMMARY_TX_OPTIONS = {
  maxWait: 5_000,
  timeout: 20_000,
} as const;

/** Dashboard 5: per-material opening/in/out/closing, computed at query time (ADR-008). */
@Injectable()
export class InventorySummaryService {
  constructor(private readonly prisma: PrismaService) {}

  async findByPeriod(
    query: InventorySummaryQueryDto,
  ): Promise<InventorySummaryResponse> {
    const period = parsePeriodMonth(query.period);

    // One transaction so all three result sets describe one instant.
    const [materials, priorBuckets, periodBuckets] =
      await this.prisma.$transaction(
        async (tx) =>
          Promise.all([
            // Every material, including those with no movements (they show as OUT).
            tx.rawMaterial.findMany({ orderBy: { name: 'asc' } }),
            tx.stockMovement.groupBy({
              by: ['rawMaterialId', 'direction'],
              where: { movementDate: { lt: period.periodStart } },
              _sum: { quantity: true },
            }),
            tx.stockMovement.groupBy({
              by: ['rawMaterialId', 'direction', 'referenceType'],
              where: {
                movementDate: { gte: period.periodStart, lt: period.periodEnd },
              },
              _sum: { quantity: true },
            }),
          ]),
        INVENTORY_SUMMARY_TX_OPTIONS,
      );

    const rows = assembleInventorySummary(
      materials.map((material) => ({
        id: material.id,
        name: material.name,
        unit: material.unit,
        lowStockThreshold: material.lowStockThreshold,
      })),
      priorBuckets.map((bucket) => ({
        rawMaterialId: bucket.rawMaterialId,
        direction: bucket.direction,
        quantity: bucket._sum?.quantity ?? new Prisma.Decimal(0),
      })),
      periodBuckets.map((bucket) => ({
        rawMaterialId: bucket.rawMaterialId,
        direction: bucket.direction,
        referenceType: bucket.referenceType,
        quantity: bucket._sum?.quantity ?? new Prisma.Decimal(0),
      })),
    );

    return {
      period: {
        month: period.month,
        startDate: period.periodStart.toISOString(),
        endDate: period.periodEnd.toISOString(),
      },
      data: rows.map((row) => ({
        rawMaterialId: row.rawMaterialId,
        name: row.name,
        unit: row.unit,
        openingQuantity: row.opening.toFixed(4),
        inQuantity: row.in.toFixed(4),
        outQuantity: row.out.toFixed(4),
        closingQuantity: row.closing.toFixed(4),
        lowStockThreshold: row.lowStockThreshold.toFixed(4),
        status: row.status,
      })),
    };
  }
}
