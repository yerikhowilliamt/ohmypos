import { Injectable } from '@nestjs/common';
import type { ProposeMatches } from '@ohmypos/api-contracts';
import Decimal from 'decimal.js';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  BankTransactionInput,
  LedgerEntryInput,
  MatchingEngine,
} from './matching-engine';

/** Ported from Kasync with the `userId` scoping removed (ERD §7 note 1). */
@Injectable()
export class MatchingService {
  constructor(private readonly prisma: PrismaService) {}

  async proposeMatches(dto?: ProposeMatches) {
    const bankTxns = await this.prisma.bankTransaction.findMany({
      where: {
        status: 'UNRESOLVED',
        ...(dto?.accountId && { accountId: dto.accountId }),
      },
    });

    if (bankTxns.length === 0) {
      return [];
    }

    // Scope ledger entries to a window around the bank transactions rather than
    // loading all history.
    const tolerance = dto?.dateToleranceDays ?? 3;
    const dates = bankTxns.map((tx) => new Date(tx.txnDate).getTime());
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));
    minDate.setUTCDate(minDate.getUTCDate() - tolerance);
    maxDate.setUTCDate(maxDate.getUTCDate() + tolerance);

    const ledgerEntries = await this.prisma.ledgerEntry.findMany({
      where: { entryDate: { gte: minDate, lte: maxDate } },
    });

    const bankInputs: BankTransactionInput[] = bankTxns.map((tx) => ({
      id: tx.id,
      amount: new Decimal(tx.amount.toString()),
      type: tx.type,
      txnDate: new Date(tx.txnDate),
    }));

    const ledgerInputs: LedgerEntryInput[] = ledgerEntries.map((le) => ({
      id: le.id,
      amount: new Decimal(le.amount.toString()),
      type: le.type,
      entryDate: new Date(le.entryDate),
    }));

    const engine = new MatchingEngine();
    const candidates = engine.proposeMatches(bankInputs, ledgerInputs, {
      dateToleranceDays: dto?.dateToleranceDays,
      maxAggregationSubsetSize: dto?.maxAggregationSubsetSize,
      maxCandidates: dto?.maxCandidates,
    });

    const bankTxnIdsToUpdate = new Set<string>();
    for (const candidate of candidates) {
      for (const id of candidate.bankTransactionIds) {
        bankTxnIdsToUpdate.add(id);
      }
    }

    if (bankTxnIdsToUpdate.size > 0) {
      await this.prisma.bankTransaction.updateMany({
        where: { id: { in: Array.from(bankTxnIdsToUpdate) } },
        data: { status: 'PENDING_REVIEW' },
      });
    }

    return candidates;
  }

  async resetMatches(accountId?: string) {
    const result = await this.prisma.bankTransaction.updateMany({
      where: {
        status: 'PENDING_REVIEW',
        ...(accountId && { accountId }),
      },
      data: { status: 'UNRESOLVED' },
    });

    return { resetCount: result.count };
  }
}
