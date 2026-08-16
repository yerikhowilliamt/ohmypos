/**
 * OhMyPos — the single authority for RawMaterial.currentStock (System Design §7,
 * ADR-007). The StockMovement log is the source of truth; currentStock is the
 * fast-read balance, and it is only ever written here, in the same transaction
 * as the movement that justifies it.
 *
 * Takes the caller's `tx` rather than using its own client: the purchase, the
 * stock movement and the ledger entry must share ONE transaction boundary
 * (Playbook §7). A method that opened its own transaction here would silently
 * break that.
 *
 * Phase 4 writes IN only. Phase 5 adds the OUT counterpart (which additionally
 * asserts the balance never goes negative and throws InsufficientStockException).
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';

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

@Injectable()
export class StockMovementsService {
  async applyInbound(
    tx: Prisma.TransactionClient,
    input: InboundStockInput,
  ): Promise<void> {
    // Lock in ascending rawMaterialId order. Two concurrent purchases touching
    // {A,B} and {B,A} would otherwise take the locks in opposite order and
    // deadlock; Postgres would abort one of them with a 40P01 at commit time,
    // which is a 500 the caller cannot act on. A deterministic order makes the
    // second transaction simply wait.
    const lines = [...input.lines].sort((a, b) =>
      a.rawMaterialId.localeCompare(b.rawMaterialId),
    );

    for (const line of lines) {
      // `id` is a TEXT column (Prisma String @id) — no ::uuid cast. Casting here
      // is the bug TASK-003's handoff records: it made every allocation a 500.
      await tx.$queryRaw`SELECT id FROM raw_materials WHERE id = ${line.rawMaterialId} FOR UPDATE`;

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
}
