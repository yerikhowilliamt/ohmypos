/**
 * OhMyPos — Payables service (ERD §3, ADR-006, System Design §6.3).
 *
 * Stored `remainingBalance` + `status` written ONLY inside the settlement transaction
 * under `SELECT ... FOR UPDATE` row lock (plan §2 Option B, §9.6).
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import {
  PayableStatus,
  type PayableSupplierSummary,
} from '@ohmypos/api-contracts';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  resolveLedgerBranchId,
  resolvePurchaseCategoryId,
} from '../../common/system-refs';
import { LedgerEntriesService } from '../ledger-entries/ledger-entries.service';
import { CreatePayableSettlementDto, PayableQueryDto } from './payables.dto';
import { assertSettlable } from './payables.rules';
import { PayableWithRelations, toPayableResponse } from './payables.mapper';

@Injectable()
export class PayablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerEntriesService: LedgerEntriesService,
  ) {}

  /**
   * Settles a payable in a single transaction under FOR UPDATE pessimistic row lock (plan §9.6).
   * Generates the expense LedgerEntry at the moment money actually leaves the account (ADR-006).
   */
  async settle(payableId: string, dto: CreatePayableSettlementDto) {
    return this.prisma.$transaction(
      async (tx) => {
        // 1. ⚠️ LOCK FIRST, READ SECOND — serializes concurrent settlements on the same payable
        await tx.$queryRaw`SELECT id FROM payables WHERE id = ${payableId} FOR UPDATE`;

        // 2. Read AFTER the lock to prevent check-then-act race
        const payable = await tx.payable.findUnique({
          where: { id: payableId },
          include: {
            supplierPurchase: true,
            supplier: true,
            settlements: true,
          },
        });
        if (!payable) {
          throw new NotFoundException(`Payable with ID ${payableId} not found`);
        }

        // 3. Verify payment account existence
        const account = await tx.account.findUnique({
          where: { id: dto.accountId },
        });
        if (!account) {
          throw new NotFoundException(
            `Account with ID ${dto.accountId} not found`,
          );
        }

        // 4. Validate settlable state (pure rule, throws domain exceptions)
        const amount = new Prisma.Decimal(dto.amount);
        assertSettlable(payable.status, payable.remainingBalance, amount);

        // 5. Calculate new remaining balance & status
        const newRemaining = payable.remainingBalance.minus(amount);
        const newStatus: PayableStatus = newRemaining.isZero()
          ? 'SETTLED'
          : 'PARTIALLY_SETTLED';

        // 6. Resolve ledger branch & category (ADR-014)
        const branchIdForLedger = await resolveLedgerBranchId(
          tx,
          payable.supplierPurchase.branchId,
        );
        const categoryId = await resolvePurchaseCategoryId(tx);

        // 7. Create expense LedgerEntry
        const entry = await this.ledgerEntriesService.createSystemEntry(tx, {
          accountId: dto.accountId,
          categoryId,
          branchId: branchIdForLedger,
          entryDate: new Date(dto.settledAt),
          amount,
          type: 'OUTFLOW',
          sourceType: 'PAYABLE_SETTLEMENT',
          sourceId: null, // linked in next step
          note: dto.note ?? null,
        });

        // 8. Create PayableSettlement and cross-link sourceId
        const settlement = await tx.payableSettlement.create({
          data: {
            payableId,
            accountId: dto.accountId,
            ledgerEntryId: entry.id,
            amount,
            settledAt: new Date(dto.settledAt),
            note: dto.note ?? null,
          },
        });

        await tx.ledgerEntry.update({
          where: { id: entry.id },
          data: { sourceId: settlement.id },
        });

        // 9. Update Payable balance & status
        await tx.payable.update({
          where: { id: payableId },
          data: {
            remainingBalance: newRemaining,
            status: newStatus,
          },
        });

        // 10. Update parent SupplierPurchase paymentStatus (decision 3 / plan §4)
        await tx.supplierPurchase.update({
          where: { id: payable.supplierPurchaseId },
          data: {
            paymentStatus: newStatus === 'SETTLED' ? 'PAID' : 'PARTIALLY_PAID',
          },
        });

        // 11. Reload and return mapped response
        const updated = (await tx.payable.findUnique({
          where: { id: payableId },
          include: {
            supplier: true,
            settlements: true,
          },
        })) as PayableWithRelations;

        return toPayableResponse(updated);
      },
      // maxWait: Phase 14 finding (B4, concurrency e2e) — 30-way settlement
      // contention on one payable serializes entirely on the step-1 FOR UPDATE
      // lock (by design), so later-queued transactions can wait longer than
      // Prisma's short default before even starting, surfacing as a connection
      // failure rather than the clean 409 assertSettlable would otherwise
      // produce. Same reasoning as OpeningStockService.upsert's maxWait.
      { maxWait: 10000, timeout: 15000 },
    );
  }

  async findAll(query: PayableQueryDto) {
    const {
      page = 1,
      limit = 50,
      sortBy,
      sortOrder = 'desc',
      supplierId,
      status,
    } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.PayableWhereInput = {
      ...(supplierId && { supplierId }),
      ...(status && { status }),
    };

    // `supplierName` is the one sort key that is not a Payable column — it lives
    // on the related Supplier, so it needs a nested orderBy rather than the flat
    // `[sortBy]: sortOrder` every other key uses.
    const orderBy: Prisma.PayableOrderByWithRelationInput =
      sortBy === 'supplierName'
        ? { supplier: { name: sortOrder } }
        : { [sortBy ?? 'createdAt']: sortOrder };

    const [data, total] = await Promise.all([
      this.prisma.payable.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          supplier: true,
          settlements: true,
        },
      }),
      this.prisma.payable.count({ where }),
    ]);

    return {
      data: (data as PayableWithRelations[]).map((p) => toPayableResponse(p)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(id: string) {
    const payable = await this.prisma.payable.findUnique({
      where: { id },
      include: {
        supplier: true,
        settlements: true,
      },
    });

    if (!payable) {
      throw new NotFoundException(`Payable with ID ${id} not found`);
    }

    return toPayableResponse(payable);
  }

  /**
   * Running payable balance per supplier (PRD §5.3).
   * Aggregates open/partially-settled payables grouped by supplier.
   */
  async getSupplierSummary(): Promise<PayableSupplierSummary[]> {
    const payables = await this.prisma.payable.findMany({
      where: {
        status: { in: ['OPEN', 'PARTIALLY_SETTLED'] },
      },
      include: {
        supplier: true,
      },
      orderBy: {
        supplier: { name: 'asc' },
      },
    });

    const map = new Map<
      string,
      {
        supplierId: string;
        supplierName: string;
        openPayableCount: number;
        totalOutstanding: Prisma.Decimal;
      }
    >();

    for (const p of payables) {
      const existing = map.get(p.supplierId) ?? {
        supplierId: p.supplierId,
        supplierName: p.supplier.name,
        openPayableCount: 0,
        totalOutstanding: new Prisma.Decimal(0),
      };

      existing.openPayableCount += 1;
      existing.totalOutstanding = existing.totalOutstanding.plus(
        p.remainingBalance,
      );
      map.set(p.supplierId, existing);
    }

    return Array.from(map.values()).map((s) => ({
      supplierId: s.supplierId,
      supplierName: s.supplierName,
      openPayableCount: s.openPayableCount,
      totalOutstanding: s.totalOutstanding.toFixed(2),
    }));
  }
}
