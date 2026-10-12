import { Injectable } from '@nestjs/common';
import type { StockMovementResponse } from '@ohmypos/api-contracts';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StockMovementQueryDto } from './stock-movements.dto';
import { assertSufficientStock } from './stock.rules';

type StockMovementWithRelations = Prisma.StockMovementGetPayload<{
  include: { rawMaterial: true; branch: true };
}>;

function toStockMovementResponse(
  m: StockMovementWithRelations,
): StockMovementResponse {
  return {
    id: m.id,
    rawMaterialId: m.rawMaterialId,
    rawMaterialName: m.rawMaterial.name,
    rawMaterialUnit: m.rawMaterial.unit,
    branchId: m.branchId,
    branchName: m.branch?.name ?? null,
    direction: m.direction,
    quantity: m.quantity.toString(),
    referenceType: m.referenceType,
    referenceId: m.referenceId,
    unitCostAtMovement: m.unitCostAtMovement.toFixed(6),
    movementDate: m.movementDate.toISOString(),
    createdAt: m.createdAt.toISOString(),
  };
}

export interface InboundStockLine {
  rawMaterialId: string;
  quantity: Prisma.Decimal;
  unitCost: Prisma.Decimal;
}

export interface InboundStockInput {
  branchId: string | null;
  /** `SALE` is used when a sale void reverses its own outbound movement. */
  referenceType: 'PURCHASE' | 'SALE';
  referenceId: string;
  movementDate: Date;
  lines: InboundStockLine[];
}

export interface OutboundStockLine {
  rawMaterialId: string;
  quantity: Prisma.Decimal;
  unitCost: Prisma.Decimal;
}

export interface OutboundStockInput {
  /** Never null: there is no central sale. */
  branchId: string;
  referenceType: 'SALE';
  referenceId: string;
  movementDate: Date;
  lines: OutboundStockLine[];
}

export interface OpeningStockLine {
  rawMaterialId: string;
  /** Signed correction; direction and absolute quantity are derived from it. */
  delta: Prisma.Decimal;
  unitCost: Prisma.Decimal;
  /** The `OpeningStock` row this line came from (one per material). */
  referenceId: string;
}

export interface OpeningStockInput {
  /** The period start, never `new Date()`. */
  movementDate: Date;
  lines: OpeningStockLine[];
}

/**
 * Sole writer of `RawMaterial.currentStock`.
 *
 * Every `apply*` method must run inside the caller's transaction and never opens
 * its own. See `README.md` in this folder for invariants and lock ordering.
 */
@Injectable()
export class StockMovementsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Paginated stock history. The only method here that is not transaction-bound. */
  async findAll(query: StockMovementQueryDto) {
    const {
      page = 1,
      limit = 50,
      sortBy,
      sortOrder = 'desc',
      search,
      rawMaterialId,
      branchId,
      direction,
      referenceType,
      startDate,
      endDate,
    } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.StockMovementWhereInput = {
      ...(search && {
        OR: [
          { rawMaterial: { name: { contains: search, mode: 'insensitive' } } },
          { branch: { name: { contains: search, mode: 'insensitive' } } },
        ],
      }),
      ...(rawMaterialId && { rawMaterialId }),
      ...(branchId && { branchId }),
      ...(direction && { direction }),
      ...(referenceType && { referenceType }),
      // movementDate, not createdAt: opening movements are back-dated to the period start.
      ...((startDate || endDate) && {
        movementDate: {
          ...(startDate && { gte: new Date(startDate) }),
          ...(endDate && { lte: new Date(endDate) }),
        },
      }),
    };

    const orderBy: Prisma.StockMovementOrderByWithRelationInput =
      sortBy === 'rawMaterialName'
        ? { rawMaterial: { name: sortOrder } }
        : { [sortBy ?? 'movementDate']: sortOrder };

    const [data, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: { rawMaterial: true, branch: true },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    return {
      data: (data as StockMovementWithRelations[]).map(toStockMovementResponse),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Row-locks the given raw materials in ascending id order (ADR-016).
   *
   * Every stock-touching flow must lock through this method so that concurrent
   * transactions acquire locks in the same order and cannot deadlock. Re-locking
   * a row the transaction already holds is a no-op.
   */
  async lockRawMaterialsInIdOrder(
    tx: Prisma.TransactionClient,
    rawMaterialIds: string[],
  ): Promise<void> {
    const uniqueSortedIds = Array.from(new Set(rawMaterialIds)).sort((a, b) =>
      a.localeCompare(b),
    );

    for (const id of uniqueSortedIds) {
      // `id` is TEXT; a ::uuid cast here breaks every caller.
      await tx.$queryRaw`SELECT id FROM raw_materials WHERE id = ${id} FOR UPDATE`;
    }
  }

  /** Records an `IN` movement per line and increments `currentStock`. Never reprices. */
  async applyInbound(
    tx: Prisma.TransactionClient,
    input: InboundStockInput,
  ): Promise<void> {
    const lines = [...input.lines].sort((a, b) =>
      a.rawMaterialId.localeCompare(b.rawMaterialId),
    );

    await this.lockRawMaterialsInIdOrder(
      tx,
      lines.map((l) => l.rawMaterialId),
    );

    for (const line of lines) {
      await tx.stockMovement.create({
        data: {
          rawMaterialId: line.rawMaterialId,
          branchId: input.branchId,
          direction: 'IN',
          quantity: line.quantity,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          unitCostAtMovement: line.unitCost,
          movementDate: input.movementDate,
        },
      });

      await tx.rawMaterial.update({
        where: { id: line.rawMaterialId },
        data: { currentStock: { increment: line.quantity } },
      });
    }
  }

  /**
   * Records an `OUT` movement per line and decrements `currentStock`.
   *
   * @throws InsufficientStockException if any line exceeds available stock.
   * Every line is validated before anything is written.
   */
  async applyOutbound(
    tx: Prisma.TransactionClient,
    input: OutboundStockInput,
  ): Promise<void> {
    const lines = [...input.lines].sort((a, b) =>
      a.rawMaterialId.localeCompare(b.rawMaterialId),
    );
    const ids = lines.map((l) => l.rawMaterialId);

    await this.lockRawMaterialsInIdOrder(tx, ids);

    const materials = await tx.rawMaterial.findMany({
      where: { id: { in: ids } },
    });
    const currentStockById = new Map(
      materials.map((m) => [m.id, m.currentStock]),
    );
    const nameById = new Map(materials.map((m) => [m.id, m.name]));

    assertSufficientStock(
      lines.map((l) => ({
        rawMaterialId: l.rawMaterialId,
        name: nameById.get(l.rawMaterialId) ?? l.rawMaterialId,
        quantity: l.quantity,
      })),
      currentStockById,
    );

    for (const line of lines) {
      await tx.stockMovement.create({
        data: {
          rawMaterialId: line.rawMaterialId,
          branchId: input.branchId,
          direction: 'OUT',
          quantity: line.quantity,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          unitCostAtMovement: line.unitCost,
          movementDate: input.movementDate,
        },
      });

      // The row lock is what makes check-then-decrement safe; `decrement` alone is not (ADR-007).
      await tx.rawMaterial.update({
        where: { id: line.rawMaterialId },
        data: { currentStock: { decrement: line.quantity } },
      });
    }
  }

  /**
   * Records a stock-take correction per line as a central `OPENING` movement.
   *
   * Does not check sufficiency; the caller validates the resulting stock first.
   * A zero delta still writes a movement as the record that a count took place.
   */
  async applyOpening(
    tx: Prisma.TransactionClient,
    input: OpeningStockInput,
  ): Promise<void> {
    const lines = [...input.lines].sort((a, b) =>
      a.rawMaterialId.localeCompare(b.rawMaterialId),
    );

    await this.lockRawMaterialsInIdOrder(
      tx,
      lines.map((l) => l.rawMaterialId),
    );

    for (const line of lines) {
      await tx.stockMovement.create({
        data: {
          rawMaterialId: line.rawMaterialId,
          // A stock-take counts the shared pool, not a branch (ADR-004).
          branchId: null,
          direction: line.delta.isNegative() ? 'OUT' : 'IN',
          quantity: line.delta.abs(),
          referenceType: 'OPENING',
          referenceId: line.referenceId,
          unitCostAtMovement: line.unitCost,
          movementDate: input.movementDate,
        },
      });

      await tx.rawMaterial.update({
        where: { id: line.rawMaterialId },
        data: { currentStock: { increment: line.delta } },
      });
    }
  }
}
