/**
 * OhMyPos — OpeningStock service (PRD §5.5, System Design §6.4, ADR-004,
 * ADR-007, ADR-016, Phase 6 plan §3, §5, §6).
 *
 * A stock-take declares what was physically counted at the start of a period.
 * This service turns that declaration into the SIGNED ledger correction it
 * implies, inside one transaction, with every raw-material row locked up front
 * in ascending id order (ADR-016) before any balance is read.
 *
 * All arithmetic lives in opening-stock.calculator.ts and opening-stock.rules.ts
 * — this file queries, maps and throws (plan §11.8).
 */
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
   * Records or corrects a whole period's opening stock in ONE transaction
   * (Playbook §7). An explicit `timeout` is set for the same reason as
   * SalesService.create: this transaction can legitimately wait on row locks
   * held by a concurrent sale (ADR-016), and Prisma's 5s interactive default
   * would surface a merely-queued request as a 500.
   */
  async upsert(
    dto: UpsertOpeningStockDto,
  ): Promise<UpsertOpeningStockResponse> {
    const period = parsePeriodMonth(dto.periodMonth);
    assertPeriodHasStarted(period, new Date());

    return this.prisma.$transaction(
      async (tx) => {
        const requestedIds = dto.entries.map((entry) => entry.rawMaterialId);

        // ── Phase 1: existence, before any lock is taken ────────────────────
        const known = await tx.rawMaterial.findMany({
          where: { id: { in: requestedIds } },
          select: { id: true },
        });
        const knownIds = new Set(known.map((material) => material.id));
        const missingIds = requestedIds.filter((id) => !knownIds.has(id));
        if (missingIds.length > 0) {
          throw new OpeningStockRawMaterialNotFoundException(missingIds);
        }

        // ── Phase 2: ALL locks, ascending id, BEFORE any read of
        //    currentStock or any aggregation (ADR-016 §3) ────────────────────
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

        // ── Phase 3: what the ledger already says about this period ─────────
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

        // "A purchase has been made this month" is read off the movement
        // ledger, not SupplierPurchaseItem — one ledger, one definition, and
        // the (rawMaterialId, movementDate) index already serves it (plan §5).
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

        // ── Phase 4: validate EVERY entry before writing ANY ────────────────
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

        // ── Phase 5: write ─────────────────────────────────────────────────
        const entryByMaterialId = new Map(
          dto.entries.map((entry) => [entry.rawMaterialId, entry]),
        );

        const rows: OpeningStockResponse[] = [];
        // Explicitly typed, not `= []`: an untyped empty array here infers
        // `any[]`, which AGENTS.md §8 forbids and which would silently accept a
        // malformed line.
        const lines: OpeningStockLine[] = [];

        // Iterating `deltas` (already sorted ascending by rawMaterialId) keeps
        // the write order identical to the lock order.
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
            // The declared price when one was required, otherwise the
            // material's current cost — unitCostAtMovement is NOT NULL and a
            // movement must always carry a valuation (plan §5).
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
          // ALWAYS periodStart. A declaration entered on the 15th with today's
          // date would land mid-period and be counted as `in`/`out` by the
          // summary's own definition (plan §11.9 trap 3).
          movementDate: period.periodStart,
          lines,
        });

        return { period: this.toPeriodResponse(period), data: rows };
      },
      { maxWait: 5000, timeout: 15000 },
    );
  }

  /**
   * The Phase 8e worksheet: one row per raw material, declared or not, with the
   * PRD §5.5 unit-price rule already decided server-side (plan §5).
   */
  async findWorksheet(
    query: OpeningStockPeriodQueryDto,
  ): Promise<OpeningStockWorksheetResponse> {
    const period = parsePeriodMonth(query.period);

    // One read transaction so the three result sets describe one instant.
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
          // Display only (ADR-024). The declared count is ALWAYS in `unit`; these
          // let the worksheet print "1 kg = 1.000 gram" beside the field so the
          // person counting can convert in their head without the form ever
          // accepting a purchase-unit value.
          purchaseUnit: material.purchaseUnit,
          conversionFactor: material.conversionFactor.toFixed(4),
        };
      }),
    };
  }
}
