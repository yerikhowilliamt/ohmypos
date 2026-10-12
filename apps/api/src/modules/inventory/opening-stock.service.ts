import { Injectable } from '@nestjs/common';
import type {
  OpeningStockResponse,
  OpeningStockWorksheetResponse,
  PeriodResponse,
  UpsertOpeningStockResponse,
} from '@ohmypos/api-contracts';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  StockMovementsService,
  type OpeningStockLine,
} from '../stock-movements/stock-movements.service';
import { computeOpeningDeltas } from './opening-stock.calculator';
import {
  assertOpeningStockNotNegative,
  assertUnitPriceRule,
  toDecimal,
} from './opening-stock.rules';
import { sumSignedByMaterial } from './inventory-summary.calculator';
import { OpeningStockRawMaterialNotFoundException } from './inventory.exceptions';
import {
  assertPeriodHasStarted,
  formatPeriodDate,
  parsePeriodMonth,
  type Period,
} from './period';
import {
  OpeningStockPeriodQueryDto,
  UpsertOpeningStockDto,
} from './opening-stock.dto';

/**
 * Records monthly stock-take declarations as signed `OPENING` corrections.
 *
 * See `README.md` in this folder for the delta formula and lock ordering.
 */
@Injectable()
export class OpeningStockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stockMovementsService: StockMovementsService,
  ) {}

  private toPeriodResponse(period: Period): PeriodResponse {
    return {
      month: period.month,
      startDate: period.periodStart.toISOString(),
      endDate: period.periodEnd.toISOString(),
    };
  }

  /**
   * Records or corrects a whole period's opening stock in one transaction.
   *
   * Idempotent per (rawMaterialId, periodMonth): resending the same body writes
   * a zero delta. Every entry is validated before anything is written.
   */
  async upsert(
    dto: UpsertOpeningStockDto,
  ): Promise<UpsertOpeningStockResponse> {
    const period = parsePeriodMonth(dto.periodMonth);
    assertPeriodHasStarted(period, new Date());

    return this.prisma.$transaction(
      async (tx) => {
        const requestedIds = dto.entries.map((entry) => entry.rawMaterialId);

        // 1. Existence check, before any lock is taken.
        const known = await tx.rawMaterial.findMany({
          where: { id: { in: requestedIds } },
          select: { id: true },
        });
        const knownIds = new Set(known.map((material) => material.id));
        const missingIds = requestedIds.filter((id) => !knownIds.has(id));
        if (missingIds.length > 0) {
          throw new OpeningStockRawMaterialNotFoundException(missingIds);
        }

        // 2. All locks, before any read of currentStock or aggregation (ADR-016).
        await this.stockMovementsService.lockRawMaterialsInIdOrder(
          tx,
          requestedIds,
        );

        const materials = await tx.rawMaterial.findMany({
          where: { id: { in: requestedIds } },
        });
        const materialById = new Map(
          materials.map((material) => [material.id, material]),
        );
        const nameById = new Map(
          materials.map((material) => [material.id, material.name]),
        );

        // 3. What the ledger already says about this period.
        const priorBuckets = await tx.stockMovement.groupBy({
          by: ['rawMaterialId', 'direction'],
          where: {
            rawMaterialId: { in: requestedIds },
            movementDate: { lt: period.periodStart },
          },
          _sum: { quantity: true },
        });

        const openingBuckets = await tx.stockMovement.groupBy({
          by: ['rawMaterialId', 'direction'],
          where: {
            rawMaterialId: { in: requestedIds },
            referenceType: 'OPENING',
            movementDate: { gte: period.periodStart, lt: period.periodEnd },
          },
          _sum: { quantity: true },
        });

        const purchasedInPeriod = await tx.stockMovement.findMany({
          where: {
            rawMaterialId: { in: requestedIds },
            referenceType: 'PURCHASE',
            movementDate: { gte: period.periodStart, lt: period.periodEnd },
          },
          select: { rawMaterialId: true },
          distinct: ['rawMaterialId'],
        });
        const materialIdsWithPurchase = new Set(
          purchasedInPeriod.map((movement) => movement.rawMaterialId),
        );

        const carryForward = sumSignedByMaterial(
          priorBuckets.map((bucket) => ({
            rawMaterialId: bucket.rawMaterialId,
            direction: bucket.direction,
            quantity: bucket._sum?.quantity ?? new Prisma.Decimal(0),
          })),
        );
        const existingOpeningDelta = sumSignedByMaterial(
          openingBuckets.map((bucket) => ({
            rawMaterialId: bucket.rawMaterialId,
            direction: bucket.direction,
            quantity: bucket._sum?.quantity ?? new Prisma.Decimal(0),
          })),
        );

        // 4. Validate every entry before writing any.
        assertUnitPriceRule(
          dto.entries.map((entry) => ({
            rawMaterialId: entry.rawMaterialId,
            name: nameById.get(entry.rawMaterialId) ?? entry.rawMaterialId,
            unitPrice: entry.unitPrice,
          })),
          materialIdsWithPurchase,
        );

        const deltas = computeOpeningDeltas(
          dto.entries.map((entry) => ({
            rawMaterialId: entry.rawMaterialId,
            declaredQuantity: toDecimal(entry.quantity),
            carryForward:
              carryForward.get(entry.rawMaterialId) ?? new Prisma.Decimal(0),
            existingOpeningDelta:
              existingOpeningDelta.get(entry.rawMaterialId) ??
              new Prisma.Decimal(0),
            currentStock: materialById.get(entry.rawMaterialId)!.currentStock,
          })),
        );

        assertOpeningStockNotNegative(deltas, nameById);

        // 5. Write.
        const entryByMaterialId = new Map(
          dto.entries.map((entry) => [entry.rawMaterialId, entry]),
        );

        const rows: OpeningStockResponse[] = [];
        const lines: OpeningStockLine[] = [];

        // `deltas` is sorted by rawMaterialId, so write order matches lock order.
        for (const delta of deltas) {
          const entry = entryByMaterialId.get(delta.rawMaterialId)!;
          const material = materialById.get(delta.rawMaterialId)!;
          const unitPrice =
            entry.unitPrice === undefined ? null : toDecimal(entry.unitPrice);

          const row = await tx.openingStock.upsert({
            where: {
              rawMaterialId_periodMonth: {
                rawMaterialId: delta.rawMaterialId,
                periodMonth: period.periodMonthDate,
              },
            },
            update: {
              quantity: toDecimal(entry.quantity),
              unitPrice,
            },
            create: {
              rawMaterialId: delta.rawMaterialId,
              periodMonth: period.periodMonthDate,
              quantity: toDecimal(entry.quantity),
              unitPrice,
            },
          });

          lines.push({
            rawMaterialId: delta.rawMaterialId,
            delta: delta.delta,
            unitCost: unitPrice ?? material.unitCost,
            referenceId: row.id,
          });

          rows.push({
            id: row.id,
            rawMaterialId: row.rawMaterialId,
            rawMaterialName: material.name,
            periodMonth: formatPeriodDate(row.periodMonth),
            quantity: row.quantity.toFixed(4),
            unitPrice: row.unitPrice === null ? null : row.unitPrice.toFixed(6),
            appliedDelta: delta.delta.toFixed(4),
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
          });
        }

        await this.stockMovementsService.applyOpening(tx, {
          // Always periodStart; a mid-period date would count as in/out in the summary.
          movementDate: period.periodStart,
          lines,
        });

        return { period: this.toPeriodResponse(period), data: rows };
      },
      { maxWait: 5000, timeout: 15000 },
    );
  }

  /**
   * One row per raw material, declared or not, with `requiresUnitPrice`
   * already decided server-side.
   */
  async findWorksheet(
    query: OpeningStockPeriodQueryDto,
  ): Promise<OpeningStockWorksheetResponse> {
    const period = parsePeriodMonth(query.period);

    // One read transaction so all result sets describe one instant.
    const [materials, priorBuckets, declarations, purchasedInPeriod] =
      await this.prisma.$transaction(async (tx) =>
        Promise.all([
          tx.rawMaterial.findMany({ orderBy: { name: 'asc' } }),
          tx.stockMovement.groupBy({
            by: ['rawMaterialId', 'direction'],
            where: { movementDate: { lt: period.periodStart } },
            _sum: { quantity: true },
          }),
          tx.openingStock.findMany({
            where: { periodMonth: period.periodMonthDate },
          }),
          tx.stockMovement.findMany({
            where: {
              referenceType: 'PURCHASE',
              movementDate: { gte: period.periodStart, lt: period.periodEnd },
            },
            select: { rawMaterialId: true },
            distinct: ['rawMaterialId'],
          }),
        ]),
      );

    const carryForward = sumSignedByMaterial(
      priorBuckets.map((bucket) => ({
        rawMaterialId: bucket.rawMaterialId,
        direction: bucket.direction,
        quantity: bucket._sum?.quantity ?? new Prisma.Decimal(0),
      })),
    );
    const declarationByMaterialId = new Map(
      declarations.map((declaration) => [
        declaration.rawMaterialId,
        declaration,
      ]),
    );
    const materialIdsWithPurchase = new Set(
      purchasedInPeriod.map((movement) => movement.rawMaterialId),
    );

    return {
      period: this.toPeriodResponse(period),
      data: materials.map((material) => {
        const declaration = declarationByMaterialId.get(material.id);
        return {
          rawMaterialId: material.id,
          name: material.name,
          unit: material.unit,
          carryForwardQuantity: (
            carryForward.get(material.id) ?? new Prisma.Decimal(0)
          ).toFixed(4),
          declaredQuantity:
            declaration === undefined ? null : declaration.quantity.toFixed(4),
          declaredUnitPrice:
            declaration === undefined || declaration.unitPrice === null
              ? null
              : declaration.unitPrice.toFixed(6),
          requiresUnitPrice: !materialIdsWithPurchase.has(material.id),
          currentUnitCost: material.unitCost.toFixed(6),
          // Display only (ADR-024); the declared count is always in `unit`.
          purchaseUnit: material.purchaseUnit,
          conversionFactor: material.conversionFactor.toFixed(4),
        };
      }),
    };
  }
}
