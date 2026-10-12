import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateLedgerEntry,
  LedgerEntryQuery,
  LedgerSourceType,
  TransactionType,
  UpdateLedgerEntry,
} from '@ohmypos/api-contracts';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { resolveLedgerBranchId } from '../../common/system-refs';
import { OTHER_BRANCH_FORBIDDEN } from '../../common/messages';

/** Ledger entries. Entries created here are always `MANUAL`. */
@Injectable()
export class LedgerEntriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a system-generated (non-`MANUAL`) entry inside the caller's
   * transaction. The only way other modules may write `ledger_entries`.
   */
  async createSystemEntry(
    tx: Prisma.TransactionClient,
    input: {
      accountId: string;
      categoryId: string;
      branchId: string;
      entryDate: Date;
      amount: Prisma.Decimal;
      type: TransactionType;
      sourceType: Exclude<LedgerSourceType, 'MANUAL'>;
      sourceId: string | null;
      note?: string | null;
    },
  ) {
    return tx.ledgerEntry.create({
      data: { ...input, note: input.note ?? null },
    });
  }

  async create(dto: CreateLedgerEntry) {
    return this.prisma.$transaction(async (tx) => {
      const branchId = await resolveLedgerBranchId(tx, dto.branchId);
      await this.assertReferencesExist(
        tx,
        dto.accountId,
        dto.categoryId,
        branchId,
      );

      return tx.ledgerEntry.create({
        data: {
          accountId: dto.accountId,
          categoryId: dto.categoryId,
          branchId,
          entryDate: new Date(dto.entryDate),
          amount: new Prisma.Decimal(dto.amount),
          type: dto.type,
          note: dto.note ?? null,
          sourceType: 'MANUAL',
        },
      });
    });
  }

  async findAll(query: LedgerEntryQuery) {
    const { page, limit, sortBy, sortOrder = 'desc' } = query;
    const skip = (page - 1) * limit;

    const entryDateFilter: Prisma.DateTimeFilter | undefined =
      query.startDate || query.endDate
        ? {
            ...(query.startDate && { gte: new Date(query.startDate) }),
            ...(query.endDate && { lte: new Date(query.endDate) }),
          }
        : undefined;

    const where: Prisma.LedgerEntryWhereInput = {
      ...(query.branchId && { branchId: query.branchId }),
      ...(query.categoryId && { categoryId: query.categoryId }),
      ...(query.accountId && { accountId: query.accountId }),
      ...(query.type && { type: query.type }),
      ...(entryDateFilter && { entryDate: entryDateFilter }),
    };

    const [data, total] = await Promise.all([
      this.prisma.ledgerEntry.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy ?? 'entryDate']: sortOrder },
      }),
      this.prisma.ledgerEntry.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /** Pass `user` to enforce KASIR branch ownership (only `GET :id` does). */
  async findOne(id: string, user?: JwtPayload) {
    const entry = await this.prisma.ledgerEntry.findUnique({ where: { id } });
    if (!entry) {
      throw new NotFoundException(
        'Catatan transaksi tidak ditemukan. Mungkin sudah dihapus — muat ulang halaman.',
      );
    }
    if (user?.role === 'KASIR' && entry.branchId !== user.branchId) {
      throw new ForbiddenException(OTHER_BRANCH_FORBIDDEN);
    }
    return entry;
  }

  async update(id: string, dto: UpdateLedgerEntry) {
    const existing = await this.findOne(id);

    if (existing.sourceType !== 'MANUAL') {
      throw new ConflictException(
        'Catatan ini dibuat otomatis oleh sistem dari transaksi lain, jadi tidak bisa diubah langsung di sini. Ubahlah transaksi asalnya.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const branchId =
        dto.branchId !== undefined
          ? await resolveLedgerBranchId(tx, dto.branchId)
          : undefined;
      await this.assertReferencesExist(
        tx,
        dto.accountId,
        dto.categoryId,
        branchId,
      );

      return tx.ledgerEntry.update({
        where: { id },
        data: {
          ...(dto.accountId !== undefined && { accountId: dto.accountId }),
          ...(dto.categoryId !== undefined && {
            categoryId: dto.categoryId,
          }),
          ...(branchId !== undefined && { branchId }),
          ...(dto.entryDate !== undefined && {
            entryDate: new Date(dto.entryDate),
          }),
          ...(dto.amount !== undefined && {
            amount: new Prisma.Decimal(dto.amount),
          }),
          ...(dto.type !== undefined && { type: dto.type }),
          ...(dto.note !== undefined && { note: dto.note ?? null }),
        },
      });
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    const allocCount = await this.prisma.allocation.count({
      where: { ledgerEntryId: id },
    });
    if (allocCount > 0) {
      throw new ConflictException(
        `Catatan ini tidak bisa dihapus karena sudah dicocokkan dengan ${allocCount} mutasi bank. Batalkan pencocokannya terlebih dahulu.`,
      );
    }

    return this.prisma.ledgerEntry.delete({ where: { id } });
  }

  /** 404 instead of a foreign-key error. */
  private async assertReferencesExist(
    tx: Prisma.TransactionClient,
    accountId?: string,
    categoryId?: string,
    branchId?: string,
  ) {
    const [account, category, branch] = await Promise.all([
      accountId ? tx.account.findUnique({ where: { id: accountId } }) : null,
      categoryId ? tx.category.findUnique({ where: { id: categoryId } }) : null,
      branchId ? tx.branch.findUnique({ where: { id: branchId } }) : null,
    ]);

    if (accountId && !account) {
      throw new NotFoundException(
        'Akun pembayaran tidak ditemukan. Mungkin sudah dihapus — muat ulang halaman.',
      );
    }
    if (categoryId && !category) {
      throw new NotFoundException(
        'Kategori tidak ditemukan. Mungkin sudah dihapus — muat ulang halaman.',
      );
    }
    if (branchId && !branch) {
      throw new NotFoundException(
        'Cabang tidak ditemukan. Mungkin sudah dihapus — muat ulang halaman.',
      );
    }
  }
}
