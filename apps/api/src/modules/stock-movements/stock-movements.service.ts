/**
 * OhMyPos — the single authority for RawMaterial.currentStock (System Design §7,
 * ADR-007). The StockMovement log is the source of truth; currentStock is the
 * fast-read balance, and it is only ever written here, in the same transaction
 * as the movement that justifies it.
 *
 * Takes the caller's `tx` rather than using its own client: the purchase/sale,
 * the stock movement and the ledger entry must share ONE transaction boundary
 * (Playbook §7). A method that opened its own transaction here would silently
 * break that.
 *
 * Phase 4 wrote IN only. Phase 5 adds the OUT counterpart (applyOutbound), plus
 * `lockRawMaterialsInIdOrder` — the ONE place every stock-touching flow takes
 * its locks, in the ONE order (ADR-016). `applyInbound` now calls it too,
 * instead of interleaving lock and write per line; same order, strictly safer,
 * and it is what keeps the invariant in one place instead of two copies of the
 * same loop drifting apart.
 *
 * Phase 6 adds the third writer, applyOpening — the OPENING movement a monthly
 * stock-take produces. It is the only one of the three whose quantity is a
 * signed correction rather than a physical arrival or consumption.
 */
import { Injectable } from '@nestjs/common';
import type { StockMovementResponse } from '@ohmypos/api-contracts';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StockMovementQueryDto } from './stock-movements.dto';
import { assertSufficientStock } from './stock.rules';

type StockMovementWithRelations = Prisma.StockMovementGetPayload<{
  include: { rawMaterial: true; branch: true };
}>;

/**
 * Decimals cross the wire as strings (ADR-010 / MoneyString, QuantityString) —
 * never as JS numbers, which would round a Decimal(18,4) quantity silently.
 */
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
  // 'SALE' added for DEBT-010: a sale void reverses its own outbound
  // movement via applyInbound, reusing the SALE reference type rather than
  // adding a dedicated one — nothing sums StockMovement by referenceType the
  // way LedgerEntry is summed by sourceType, so the reuse is safe here.
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
  /** Never null — there is no central sale (ADR-004, ADR-014, ADR-015). */
  branchId: string;
  referenceType: 'SALE';
  referenceId: string;
  movementDate: Date;
  lines: OutboundStockLine[];
}

export interface OpeningStockLine {
  rawMaterialId: string;
  /** SIGNED correction — direction and quantity are derived here, not by the caller. */
  delta: Prisma.Decimal;
  /** OpeningStock.unitPrice ?? rawMaterial.unitCost (plan §5). */
  unitCost: Prisma.Decimal;
  /**
   * The OpeningStock row this movement came from. Per LINE, unlike
   * applyInbound/applyOutbound: one purchase or one sale is a single event with
   * one id, but a bulk stock-take writes one OpeningStock row per material.
   */
  referenceId: string;
}

export interface OpeningStockInput {
  /** ALWAYS periodStart — never `new Date()` (plan §11.9 trap 3). */
  movementDate: Date;
  lines: OpeningStockLine[];
}

@Injectable()
export class StockMovementsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The READ half of this module (TASK-070), and deliberately the ONLY method
   * here that uses `this.prisma` instead of taking the caller's `tx`: it is a
   * query, not a participant in anyone's transaction boundary. The three
   * `apply*` methods below must keep taking `tx` — see the file header.
   */
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
      // A central movement (branchId null) cannot match the `branch` clause and
      // that is correct — there is no branch name on it to match against.
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
      // `movementDate`, NOT `createdAt`: applyOpening stamps movementDate with
      // the period start, so a stock-take entered on the 5th belongs to the 1st.
      // Filtering createdAt would hide it from a search for its own period.
      ...((startDate || endDate) && {
        movementDate: {
          ...(startDate && { gte: new Date(startDate) }),
          ...(endDate && { lte: new Date(endDate) }),
        },
      }),
    };

    // `rawMaterialName` is the one sort key that is not a StockMovement column
    // — same nested-orderBy shape as `supplierName` in PayablesService.
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
        // `branch` is a NULLABLE relation and Prisma's include left-joins it, so
        // central rows (every OPENING, every central purchase) come back with
        // branch: null rather than being dropped. That is most of this table.
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
        // `|| 1` — an empty result is still one (empty) page. Reporting 0 here
        // is the bug TASK-068 fixed in ReconciliationService.
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * The ONE place raw-material locks are taken, in the ONE order every flow
   * uses (ADR-016). Ascending rawMaterialId: two transactions touching {A,B}
   * and {B,A} would otherwise take the locks in opposite order and deadlock;
   * Postgres would abort one of them with a 40P01, which is a 500 the caller
   * cannot act on. A deterministic order makes the second transaction simply
   * wait, and it holds across flows — a concurrent sale and purchase touching
   * the same materials cannot deadlock with each other either.
   *
   * Re-locking a row this transaction already holds is a no-op wait, which is
   * why `applyOutbound` can safely call this again after `SalesService` already
   * locked the same rows to read `unitCost` for the HPP snapshot (ADR-016 §3):
   * `applyOutbound` must stay correct even if called from a flow that did not
   * lock first.
   */
  async lockRawMaterialsInIdOrder(
    tx: Prisma.TransactionClient,
    rawMaterialIds: string[],
  ): Promise<void> {
    const uniqueSortedIds = Array.from(new Set(rawMaterialIds)).sort((a, b) =>
      a.localeCompare(b),
    );

    for (const id of uniqueSortedIds) {
      // `id` is a TEXT column (Prisma String @id) — no ::uuid cast. Casting here
      // is the bug TASK-003's handoff records: it made every allocation a 500.
      await tx.$queryRaw`SELECT id FROM raw_materials WHERE id = ${id} FOR UPDATE`;
    }
  }

  async applyInbound(
    tx: Prisma.TransactionClient,
    input: InboundStockInput,
  ): Promise<void> {
    const lines = [...input.lines].sort((a, b) =>
      a.rawMaterialId.localeCompare(b.rawMaterialId),
    );

    // Lock everything up front, before any write — ADR-016.
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

      // `increment` is an atomic UPDATE … SET x = x + n, so the balance is never
      // read into JS and written back. The FOR UPDATE above is still required:
      // it serializes the whole movement+balance pair, not just the arithmetic.
      await tx.rawMaterial.update({
        where: { id: line.rawMaterialId },
        data: { currentStock: { increment: line.quantity } },
      });

      // The unitCost write-back deliberately does NOT happen here, even for an
      // inbound purchase movement. A stock movement is not a pricing event —
      // this same method also reverses a voided sale — so repricing from here
      // would let a void change every product's live HPP. Only a purchase
      // reprices a material, and SupplierPurchasesService owns that write, in
      // this same transaction (ADR-024, step 8b; closes DEBT-006).
    }
  }

  /**
   * The OUT counterpart of applyInbound (ADR-007, ADR-015, System Design §6.1).
   * Validates EVERY line before writing ANY movement, so an insufficient-stock
   * sale never reaches a partial decrement even before the transaction rolls
   * back — two independent mechanisms delivering the same guarantee.
   */
  async applyOutbound(
    tx: Prisma.TransactionClient,
    input: OutboundStockInput,
  ): Promise<void> {
    const lines = [...input.lines].sort((a, b) =>
      a.rawMaterialId.localeCompare(b.rawMaterialId),
    );
    const ids = lines.map((l) => l.rawMaterialId);

    // Re-locking rows SalesService already locked to read unitCost is a no-op
    // wait (see the doc comment above) — this call is what keeps applyOutbound
    // correct on its own, independent of what the caller already did.
    await this.lockRawMaterialsInIdOrder(tx, ids);

    const materials = await tx.rawMaterial.findMany({
      where: { id: { in: ids } },
    });
    const currentStockById = new Map(
      materials.map((m) => [m.id, m.currentStock]),
    );
    const nameById = new Map(materials.map((m) => [m.id, m.name]));

    // Fails closed on a material this loop cannot even name — assertSufficientStock
    // treats an id missing from the map as a shortfall, not a skip.
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

      // `decrement` is an atomic UPDATE … SET x = x − n, so the balance is never
      // read into JS and written back — but the FOR UPDATE above is still
      // required: it serializes the check-then-act pair (assertSufficientStock
      // above vs. this decrement), not the arithmetic. Removing the lock and
      // keeping `decrement` yields a negative balance under concurrency with no
      // error, which is exactly the failure ADR-007 exists to prevent.
      await tx.rawMaterial.update({
        where: { id: line.rawMaterialId },
        data: { currentStock: { decrement: line.quantity } },
      });

      // Not updating rawMaterial.unitCost — a sale consumes stock, it does not
      // reprice it. Same rule as applyInbound above (ADR-024).
    }
  }

  /**
   * The OPENING counterpart of applyInbound/applyOutbound (System Design §6.4,
   * ADR-016, plan §3.2).
   *
   * Deliberately does NOT call assertSufficientStock. The negative-result check
   * happens in OpeningStockService BEFORE any write, against `resultingStock`,
   * so the error can name the declared figure the user typed rather than a
   * shortfall they never asked for.
   *
   * A zero delta still writes a movement (quantity 0.0000). It is the ledger's
   * record that a count was taken and confirmed the balance, and it is inert in
   * every sum — which keeps "one declaration, one movement" true and makes the
   * e2e assertions on movement counts unambiguous.
   */
  async applyOpening(
    tx: Prisma.TransactionClient,
    input: OpeningStockInput,
  ): Promise<void> {
    const lines = [...input.lines].sort((a, b) =>
      a.rawMaterialId.localeCompare(b.rawMaterialId),
    );

    // Re-locking rows the caller already holds is a no-op wait — this call is
    // what keeps applyOpening correct on its own, independent of the caller.
    await this.lockRawMaterialsInIdOrder(
      tx,
      lines.map((l) => l.rawMaterialId),
    );

    for (const line of lines) {
      await tx.stockMovement.create({
        data: {
          rawMaterialId: line.rawMaterialId,
          // ERD §3 names OPENING as the example of a central event: a
          // stock-take counts the shared pool, not one outlet's shelf.
          // Attributing it to a branch would put centralized stock into a
          // branch-shaped column, which is the ADR-004 mistake this schema
          // exists to prevent.
          branchId: null,
          direction: line.delta.isNegative() ? 'OUT' : 'IN',
          quantity: line.delta.abs(),
          referenceType: 'OPENING',
          referenceId: line.referenceId,
          unitCostAtMovement: line.unitCost,
          movementDate: input.movementDate,
        },
      });

      // `increment` with a negative Decimal is a correct atomic subtraction, so
      // there is one code path here rather than a sign branch. The FOR UPDATE
      // above is still required: it serializes the check-then-act pair (the
      // caller's carry-forward read vs. this write), not the arithmetic.
      await tx.rawMaterial.update({
        where: { id: line.rawMaterialId },
        data: { currentStock: { increment: line.delta } },
      });

      // Not updating rawMaterial.unitCost — a stock-take corrects the COUNT, not
      // the price. `OpeningStock.unitPrice` values THIS movement and nothing
      // else; letting it reprice the material would make a count silently
      // rewrite live HPP (ADR-024).
    }
  }
}
