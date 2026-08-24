import { Injectable } from '@nestjs/common';
import type {
  ReconciliationQuery,
  ReconciliationSummary,
} from '@ohmypos/api-contracts';
import Decimal from 'decimal.js';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';

/**
 * Ported from Kasync with the `userId` scoping removed (ERD §7 note 1).
 * Read-only aggregation, computed at query time (ADR-008).
 */
@Injectable()
export class ReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  async getTransactions(query: ReconciliationQuery) {
    const { page, limit, sortOrder = 'desc' } = query;
    const [bankTxnWhere] = this.buildWhereClause(query);

    // Deliberately applied here and NOT inside buildWhereClause:
    // getDashboardSummary derives both sides of `variance` from that same
    // clause, and the keyword can only match a bank transaction's description.
    // Narrowing the bank side while the ledger side stays whole would turn
    // `variance` into a wrong number that still looks official.
    if (query.search) {
      bankTxnWhere.description = {
        contains: query.search,
        mode: 'insensitive',
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.bankTransaction.findMany({
        where: bankTxnWhere,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [query.sortBy ?? 'txnDate']: sortOrder },
      }),
      this.prisma.bankTransaction.count({ where: bankTxnWhere }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        // `|| 1` matches every other paginated service (sales, payables,
        // supplier-purchases, ledger-entries). Without it an empty result
        // reports totalPages: 0, which reads as "page 1 of 0".
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async getDashboardSummary(
    query: ReconciliationQuery,
  ): Promise<ReconciliationSummary> {
    const [bankTxnWhere, ledgerWhere] = this.buildWhereClause(query);

    const counts: ReconciliationSummary['counts'] = {
      UNRESOLVED: 0,
      PENDING_REVIEW: 0,
      PARTIALLY_ALLOCATED: 0,
      MATCHED: 0,
    };

    const statusCounts = await this.prisma.bankTransaction.groupBy({
      by: ['status'],
      where: bankTxnWhere,
      _count: { _all: true },
    });

    for (const sc of statusCounts) {
      counts[sc.status] = sc._count._all;
    }

    // The balance always reflects the full bank position, so the status filter
    // is dropped here deliberately (unchanged from Kasync).
    const balanceWhere = { ...bankTxnWhere };
    delete balanceWhere.status;

    const [bankIn, bankOut, ledgerIn, ledgerOut] = await Promise.all([
      this.sumAmount('bankTransaction', { ...balanceWhere, type: 'INFLOW' }),
      this.sumAmount('bankTransaction', { ...balanceWhere, type: 'OUTFLOW' }),
      this.sumAmount('ledgerEntry', { ...ledgerWhere, type: 'INFLOW' }),
      this.sumAmount('ledgerEntry', { ...ledgerWhere, type: 'OUTFLOW' }),
    ]);

    const actualBankBalance = bankIn.minus(bankOut);
    const recordedLedgerBalance = ledgerIn.minus(ledgerOut);

    return {
      counts,
      actualBankBalance: actualBankBalance.toFixed(2),
      recordedLedgerBalance: recordedLedgerBalance.toFixed(2),
      variance: actualBankBalance.minus(recordedLedgerBalance).toFixed(2),
    };
  }

  private async sumAmount(
    model: 'bankTransaction' | 'ledgerEntry',
    where: Prisma.BankTransactionWhereInput | Prisma.LedgerEntryWhereInput,
  ): Promise<Decimal> {
    const result =
      model === 'bankTransaction'
        ? await this.prisma.bankTransaction.aggregate({
            _sum: { amount: true },
            where: where as Prisma.BankTransactionWhereInput,
          })
        : await this.prisma.ledgerEntry.aggregate({
            _sum: { amount: true },
            where: where as Prisma.LedgerEntryWhereInput,
          });

    return new Decimal(result._sum.amount?.toString() ?? '0');
  }

  private buildWhereClause(
    query: ReconciliationQuery,
  ): [Prisma.BankTransactionWhereInput, Prisma.LedgerEntryWhereInput] {
    const bankTxnWhere: Prisma.BankTransactionWhereInput = {};
    const ledgerWhere: Prisma.LedgerEntryWhereInput = {};

    if (query.accountId) {
      bankTxnWhere.accountId = query.accountId;
      ledgerWhere.accountId = query.accountId;
    }

    if (query.type) {
      bankTxnWhere.type = query.type;
      ledgerWhere.type = query.type;
    }

    if (query.status) {
      bankTxnWhere.status = query.status;
    }

    if (query.startDate || query.endDate) {
      const range: Prisma.DateTimeFilter = {};
      if (query.startDate) range.gte = new Date(query.startDate);
      if (query.endDate) range.lte = new Date(query.endDate);
      bankTxnWhere.txnDate = range;
      ledgerWhere.entryDate = range;
    }

    if (query.categoryId || query.branchId) {
      const ledgerSubFilter: Prisma.LedgerEntryWhereInput = {};
      if (query.categoryId) ledgerSubFilter.categoryId = query.categoryId;
      if (query.branchId) ledgerSubFilter.branchId = query.branchId;

      bankTxnWhere.allocations = {
        some: { status: 'ACTIVE', ledgerEntry: ledgerSubFilter },
      };

      if (query.categoryId) ledgerWhere.categoryId = query.categoryId;
      if (query.branchId) ledgerWhere.branchId = query.branchId;
    }

    return [bankTxnWhere, ledgerWhere];
  }
}
