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
import { requireTenantId } from '../../common/prisma/tenant-context';
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
        await tx.$queryRaw`SELECT id FROM bank_transactions WHERE id = ${txnId} AND tenant_id = ${requireTenantId()} FOR UPDATE`;

        const bankTransaction = await tx.bankTransaction.findUnique({
          where: { id: txnId },
          include: { allocations: true },
        });

        if (!bankTransaction) {
          throw new NotFoundException(
            'Mutasi bank tidak ditemukan. Mungkin sudah dihapus — muat ulang halaman.',
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
              `Jumlah alokasi harus lebih besar dari 0, bukan ${item.amountPortion}.`,
            );
          }
          return sum.plus(amount);
        }, new Decimal(0));

        const totalSum = existingSum.plus(newItemsSum);
        const txnAmount = new Decimal(bankTransaction.amount.toString());

        if (totalSum.gt(txnAmount)) {
          throw new BadRequestException(
            `Total alokasi ${totalSum.toString()} melebihi nilai mutasi bank ${txnAmount.toString()}. Kurangi jumlahnya.`,
          );
        }

        for (const item of txnItems) {
          // Kunci entri buku besar SESUDAH transaksi bank — lihat rencana
          // TASK-083 §Jebakan. Membalik urutan ini membuat dua alokasi
          // bersamaan yang menyentuh pasangan (txn, entry) yang bertukar bisa
          // saling deadlock, dan Postgres membatalkan salah satunya dengan
          // 40P01 yang tidak bisa ditindaklanjuti pemanggil.
          await tx.$queryRaw`SELECT id FROM ledger_entries WHERE id = ${item.ledgerEntryId} AND tenant_id = ${requireTenantId()} FOR UPDATE`;

          const ledgerEntry = await tx.ledgerEntry.findUnique({
            where: { id: item.ledgerEntryId },
          });

          if (!ledgerEntry) {
            throw new NotFoundException(
              'Catatan transaksi tidak ditemukan. Mungkin sudah dihapus — muat ulang halaman.',
            );
          }

          if (bankTransaction.type !== ledgerEntry.type) {
            throw new BadRequestException(
              'Arah mutasi bank dan catatan transaksi tidak cocok — uang masuk hanya bisa dipasangkan dengan uang masuk.',
            );
          }

          if (item.idempotencyKey) {
            const existing = resolvedIdempotent.get(item.idempotencyKey);
            if (existing) {
              created.push(existing);
              continue;
            }
          }

          // DEF-A3: batas sisi-entri. Kembarannya di sisi transaksi bank ada di
          // atas (baris ~100); trigger trg_check_ledger_allocation_sum
          // menegakkan hal yang sama di basis data dan itulah yang menutup
          // balapan. Dua-duanya disengaja (lihat komentar kepala berkas).
          const entryAllocations = await tx.allocation.findMany({
            where: { ledgerEntryId: item.ledgerEntryId, status: 'ACTIVE' },
          });
          const entryAllocated = entryAllocations.reduce(
            (sum, alloc) =>
              sum.plus(new Decimal(alloc.amountPortion.toString())),
            new Decimal(0),
          );
          const entryAmount = new Decimal(ledgerEntry.amount.toString());
          const wouldBe = entryAllocated.plus(new Decimal(item.amountPortion));

          if (wouldBe.gt(entryAmount)) {
            throw new BadRequestException(
              `Total alokasi ${wouldBe.toString()} melebihi nilai catatan transaksi ${entryAmount.toString()}. Kurangi jumlahnya.`,
            );
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
    return this.prisma.$transaction(async (tx) => {
      const target = await tx.allocation.findUnique({ where: { id } });
      if (!target) {
        throw new NotFoundException(
          'Pencocokan tidak ditemukan. Mungkin sudah dihapus — muat ulang halaman.',
        );
      }

      // DEF-QA-02: lock the same parent rows `create()` locks, in the same
      // order (bank_transactions then ledger_entries), before touching the
      // allocation itself. Without this, a concurrent `create()` on the same
      // transaction/entry pair can read the allocation-sum aggregate mid-
      // revoke and either over-count a row that is about to disappear or
      // under-count one that a rolled-back revoke never actually removed —
      // exactly the TOCTOU race the trigger alone was not enough to close at
      // the application layer. Matching `create()`'s lock order also means
      // the two operations can never deadlock against each other.
      await tx.$queryRaw`SELECT id FROM bank_transactions WHERE id = ${target.bankTransactionId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM ledger_entries WHERE id = ${target.ledgerEntryId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM allocations WHERE id = ${id} FOR UPDATE`;

      const allocation = await tx.allocation.findUnique({ where: { id } });
      if (!allocation) {
        throw new NotFoundException(
          'Pencocokan tidak ditemukan. Mungkin sudah dihapus — muat ulang halaman.',
        );
      }
      if (allocation.status === 'REVOKED') {
        throw new BadRequestException(
          'Pencocokan ini sudah dibatalkan sebelumnya.',
        );
      }

      return tx.allocation.update({
        where: { id },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });
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

    throw new BadRequestException(
      'Pilih minimal satu catatan transaksi untuk dicocokkan.',
    );
  }
}
