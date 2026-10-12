import { Injectable, NotFoundException } from '@nestjs/common';
import {
  PayableStatus,
  type PayableSupplierSummary,
} from '@ohmypos/api-contracts';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { requireTenantId } from '../../common/prisma/tenant-context';
import {
  resolveLedgerBranchId,
  resolvePurchaseCategoryId,
} from '../../common/system-refs';
import { LedgerEntriesService } from '../ledger-entries/ledger-entries.service';
import { CreatePayableSettlementDto, PayableQueryDto } from './payables.dto';
import { assertSettlable } from './payables.rules';
import { PayableWithRelations, toPayableResponse } from './payables.mapper';
import { isIdempotencyReplay } from '../../common/idempotency';

@Injectable()
export class PayablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerEntriesService: LedgerEntriesService,
  ) {}

  /**
   * Settles a payable under a row lock and writes the expense ledger entry at
   * the moment money leaves the account (ADR-006).
   */
  async settle(payableId: string, dto: CreatePayableSettlementDto) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          // Replay pre-check; a concurrent replay is caught by the unique index below.
          if (dto.idempotencyKey) {
            const existingSettlement = await tx.payableSettlement.findUnique({
              where: {
                tenantId_idempotencyKey: {
                  tenantId: requireTenantId(),
                  idempotencyKey: dto.idempotencyKey,
                },
              },
            });
            if (existingSettlement) {
              const replayPayable = await tx.payable.findUnique({
                where: { id: existingSettlement.payableId },
                include: {
                  supplier: true,
                  settlements: true,
                },
              });
              if (replayPayable) {
                return toPayableResponse(replayPayable);
              }
            }
          }

          // 1. Lock first, read second: serializes concurrent settlements.
          await tx.$queryRaw`SELECT id FROM payables WHERE id = ${payableId} AND tenant_id = ${requireTenantId()} FOR UPDATE`;

          // 2. Read after the lock (no check-then-act race).
          const payable = await tx.payable.findUnique({
            where: { id: payableId },
            include: {
              supplierPurchase: true,
              supplier: true,
              settlements: true,
            },
          });
          if (!payable) {
            throw new NotFoundException(
              'Utang tidak ditemukan. Mungkin sudah dihapus — muat ulang halaman.',
            );
          }

          // 3. Payment account.
          const account = await tx.account.findUnique({
            where: { id: dto.accountId },
          });
          if (!account) {
            throw new NotFoundException(
              'Akun pembayaran tidak ditemukan. Mungkin sudah dihapus — muat ulang halaman.',
            );
          }

          // 4. Validate (pure rule).
          const amount = new Prisma.Decimal(dto.amount);
          assertSettlable(payable.status, payable.remainingBalance, amount);

          // 5. New balance and status.
          const newRemaining = payable.remainingBalance.minus(amount);
          const newStatus: PayableStatus = newRemaining.isZero()
            ? 'SETTLED'
            : 'PARTIALLY_SETTLED';

          // 6. Ledger branch and category (ADR-014).
          const branchIdForLedger = await resolveLedgerBranchId(
            tx,
            payable.supplierPurchase.branchId,
          );
          const categoryId = await resolvePurchaseCategoryId(tx);

          // 7. Expense ledger entry.
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

          // 8. Settlement row, cross-linked as the entry's source.
          const settlement = await tx.payableSettlement.create({
            data: {
              payableId,
              accountId: dto.accountId,
              ledgerEntryId: entry.id,
              amount,
              settledAt: new Date(dto.settledAt),
              note: dto.note ?? null,
              idempotencyKey: dto.idempotencyKey ?? null,
            },
          });

          await tx.ledgerEntry.update({
            where: { id: entry.id },
            data: { sourceId: settlement.id },
          });

          // 9. Payable balance and status.
          await tx.payable.update({
            where: { id: payableId },
            data: {
              remainingBalance: newRemaining,
              status: newStatus,
            },
          });

          // 10. Parent purchase paymentStatus.
          await tx.supplierPurchase.update({
            where: { id: payable.supplierPurchaseId },
            data: {
              paymentStatus:
                newStatus === 'SETTLED' ? 'PAID' : 'PARTIALLY_PAID',
            },
          });

          const updated = (await tx.payable.findUnique({
            where: { id: payableId },
            include: {
              supplier: true,
              settlements: true,
            },
          })) as PayableWithRelations;

          return toPayableResponse(updated);
        },
        // Long maxWait: heavy contention queues on the step-1 lock (B4).
        { maxWait: 10000, timeout: 15000 },
      );
    } catch (error) {
      if (
        dto.idempotencyKey &&
        isIdempotencyReplay(
          error,
          'payable_settlements_tenant_id_idempotency_key_key',
        )
      ) {
        const existing = await this.prisma.payableSettlement.findUnique({
          where: {
            tenantId_idempotencyKey: {
              tenantId: requireTenantId(),
              idempotencyKey: dto.idempotencyKey,
            },
          },
        });
        if (existing) {
          const parent = await this.prisma.payable.findUnique({
            where: { id: existing.payableId },
            include: {
              supplier: true,
              settlements: true,
            },
          });
          if (parent) {
            return toPayableResponse(parent);
          }
        }
      }
      throw error;
    }
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

    // `supplierName` lives on Supplier, so it needs a nested orderBy.
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
      throw new NotFoundException(
        'Utang tidak ditemukan. Mungkin sudah dihapus — muat ulang halaman.',
      );
    }

    return toPayableResponse(payable);
  }

  /** Open payable balance per supplier (PRD §5.3). */
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
