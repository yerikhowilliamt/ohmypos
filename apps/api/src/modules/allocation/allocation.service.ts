import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateAllocation,
  CreateSingleAllocation,
} from '@ohmypos/api-contracts';
import Decimal from 'decimal.js';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';

/**
 * Ported from Kasync with the `userId` scoping removed (ERD §7 note 1).
 *
 * The allocation-sum invariant is enforced twice on purpose, exactly as in
 * Kasync: once here in the application (so the caller gets a clear 400), and
 * once by the `trg_check_allocation_sum` database trigger, which takes a
 * `FOR UPDATE` lock and is what actually closes the check-then-act race under
 * concurrency (Playbook §7). Removing either half is not a simplification.
 */
@Injectable()
export class AllocationService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateAllocation) {
    const items = this.normaliseItems(dto);

    const groupedItems = items.reduce<Record<string, CreateSingleAllocation[]>>(
      (acc, item) => {
        acc[item.bankTransactionId] ??= [];
        acc[item.bankTransactionId].push(item);
        return acc;
      },
      {},
    );

    return this.prisma.$transaction(async (tx) => {
      const created = [];

      for (const [txnId, txnItems] of Object.entries(groupedItems)) {
        // Lock the bank transaction row first — same guard the trigger uses.
        // `id` is a TEXT column (Prisma String @id), so no ::uuid cast here —
        // Postgres would reject the text = uuid comparison.
        await tx.$queryRaw`SELECT id FROM bank_transactions WHERE id = ${txnId} FOR UPDATE`;

        const bankTransaction = await tx.bankTransaction.findUnique({
          where: { id: txnId },
          include: { allocations: true },
        });

        if (!bankTransaction) {
          throw new NotFoundException(
            `BankTransaction with id ${txnId} not found`,
          );
        }

        const existingSum = bankTransaction.allocations.reduce(
          (sum, alloc) =>
            alloc.status === 'ACTIVE'
              ? sum.plus(new Decimal(alloc.amountPortion.toString()))
              : sum,
          new Decimal(0),
        );

        // Resolve idempotent items up front so they are excluded from the cap.
        const resolvedIdempotent = new Map<
          string,
          Awaited<ReturnType<typeof tx.allocation.findFirst>>
        >();
        for (const item of txnItems) {
          if (item.idempotencyKey) {
            const existing = await tx.allocation.findFirst({
              where: {
                bankTransactionId: item.bankTransactionId,
                idempotencyKey: item.idempotencyKey,
              },
            });
            if (existing) {
              resolvedIdempotent.set(item.idempotencyKey, existing);
            }
          }
        }

        const newItemsSum = txnItems.reduce((sum, item) => {
          if (
            item.idempotencyKey &&
            resolvedIdempotent.has(item.idempotencyKey)
          ) {
            return sum; // already allocated — does not count toward the cap
          }
          const amount = new Decimal(item.amountPortion);
          if (amount.lte(0)) {
            throw new BadRequestException(
              `amountPortion must be positive, got ${item.amountPortion}`,
            );
          }
          return sum.plus(amount);
        }, new Decimal(0));

        const totalSum = existingSum.plus(newItemsSum);
        const txnAmount = new Decimal(bankTransaction.amount.toString());

        if (totalSum.gt(txnAmount)) {
          throw new BadRequestException(
            `Total allocation (${totalSum.toString()}) exceeds transaction amount (${txnAmount.toString()}) for transaction ${txnId}`,
          );
        }

        for (const item of txnItems) {
          const ledgerEntry = await tx.ledgerEntry.findUnique({
            where: { id: item.ledgerEntryId },
          });

          if (!ledgerEntry) {
            throw new NotFoundException(
              `LedgerEntry with id ${item.ledgerEntryId} not found`,
            );
          }

          // Direction must agree — you cannot settle an outflow with an inflow.
          if (bankTransaction.type !== ledgerEntry.type) {
            throw new BadRequestException(
              `BankTransaction type (${bankTransaction.type}) does not match LedgerEntry type (${ledgerEntry.type})`,
            );
          }

          if (item.idempotencyKey) {
            const existing = resolvedIdempotent.get(item.idempotencyKey);
            if (existing) {
              created.push(existing);
              continue;
            }
          }

          created.push(
            await tx.allocation.create({
              data: {
                bankTransactionId: item.bankTransactionId,
                ledgerEntryId: item.ledgerEntryId,
                amountPortion: new Prisma.Decimal(item.amountPortion),
                idempotencyKey: item.idempotencyKey ?? null,
                status: 'ACTIVE',
              },
            }),
          );
        }
      }

      return created;
    });
  }

  async revoke(id: string) {
    const allocation = await this.prisma.allocation.findUnique({
      where: { id },
    });

    if (!allocation) {
      throw new NotFoundException(`Allocation with id ${id} not found`);
    }

    if (allocation.status === 'REVOKED') {
      throw new BadRequestException(`Allocation ${id} is already revoked`);
    }

    return this.prisma.allocation.update({
      where: { id },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
  }

  async findByTransaction(txnId: string) {
    return this.prisma.allocation.findMany({
      where: { bankTransactionId: txnId },
      include: { ledgerEntry: true },
    });
  }

  async findByLedgerEntry(ledgerEntryId: string) {
    return this.prisma.allocation.findMany({
      where: { ledgerEntryId },
      include: { bankTransaction: true },
    });
  }

  /** Flattens Kasync's dual-shape request into a single list. */
  private normaliseItems(dto: CreateAllocation): CreateSingleAllocation[] {
    if (dto.allocations && dto.allocations.length > 0) {
      return dto.allocations;
    }

    if (dto.bankTransactionId && dto.ledgerEntryId && dto.amountPortion) {
      return [
        {
          bankTransactionId: dto.bankTransactionId,
          ledgerEntryId: dto.ledgerEntryId,
          amountPortion: dto.amountPortion,
          ...(dto.idempotencyKey && { idempotencyKey: dto.idempotencyKey }),
        },
      ];
    }

    throw new BadRequestException('No allocations provided');
  }
}
