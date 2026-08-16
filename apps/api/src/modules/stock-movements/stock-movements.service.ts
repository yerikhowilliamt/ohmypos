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
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { assertSufficientStock } from './stock.rules';

export interface InboundStockLine {
  rawMaterialId: string;
  quantity: Prisma.Decimal;
  unitCost: Prisma.Decimal;
}

export interface InboundStockInput {
  branchId: string | null;
  referenceType: 'PURCHASE';
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

@Injectable()
export class StockMovementsService {
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

      // Deliberately NOT updating rawMaterial.unitCost — see plan §5 / DEBT-006.
      // Writing the purchase price back here would change every product's live
      // HPP (ADR-005) and is a costing-method decision with no ADR behind it.
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

      // Deliberately NOT updating rawMaterial.unitCost — same omission and same
      // reason as applyInbound (plan §5 / DEBT-006).
    }
  }
}
