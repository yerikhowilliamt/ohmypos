import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
      return { candidates: [], truncated: false };
    }

    // Scope ledger entries to a window around the bank transactions rather than
    // loading all history.
    const tolerance = dto?.dateToleranceDays ?? 3;
    const dates = bankTxns.map((tx) => new Date(tx.txnDate).getTime());
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));
    minDate.setUTCDate(minDate.getUTCDate() - tolerance);
    maxDate.setUTCDate(maxDate.getUTCDate() + tolerance);

    // TASK-084: jendela ini dulu tak berbatas — rentang min-ke-maks SELURUH
    // transaksi UNRESOLVED. Satu transaksi lama yang tidak pernah
    // direkonsiliasi menarik setahun entri ke dalam memori dan ke dalam
    // enumerasi subset. `take` memberi batas atas yang bisa dihitung; urutan
    // menaik `entryDate` membuat potongannya deterministik, bukan sembarang.
    const MAX_LEDGER_WINDOW = 5000;

    const ledgerEntries = await this.prisma.ledgerEntry.findMany({
      where: { entryDate: { gte: minDate, lte: maxDate } },
      orderBy: { entryDate: 'asc' },
      take: MAX_LEDGER_WINDOW,
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
    const { candidates, truncated } = engine.proposeMatches(
      bankInputs,
      ledgerInputs,
      {
        dateToleranceDays: dto?.dateToleranceDays,
        maxAggregationSubsetSize: dto?.maxAggregationSubsetSize,
        maxCandidates: dto?.maxCandidates,
      },
    );

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

    return {
      candidates,
      // `true` berarti: pencarian berhenti sebelum selesai. UI wajib
      // mengatakannya kepada pengguna — "tidak ada kandidat lain" dan "kami
      // berhenti mencari" adalah dua kalimat yang berbeda.
      truncated: truncated || ledgerEntries.length === MAX_LEDGER_WINDOW,
    };
  }

  /**
   * Rejects a single proposed match, returning that one bank transaction to
   * UNRESOLVED. Frontend Reconciliation screen's "Abaikan" action
   * (docs/plannings/phase-8h-reconciliation.md §6.2) — unlike `resetMatches`,
   * this scopes to exactly one transaction rather than every PENDING_REVIEW
   * row for an account.
   *
   * Only valid from PENDING_REVIEW: that is the only status `proposeMatches`
   * ever writes, and the only status a "reject one candidate" action makes
   * sense against.
   */
  async rejectMatch(bankTransactionId: string) {
    const transaction = await this.prisma.bankTransaction.findUnique({
      where: { id: bankTransactionId },
    });

    if (!transaction) {
      throw new NotFoundException(
        `Bank transaction with id ${bankTransactionId} not found`,
      );
    }

    if (transaction.status !== 'PENDING_REVIEW') {
      throw new ConflictException(
        `Bank transaction ${bankTransactionId} is not pending review (current status: ${transaction.status})`,
      );
    }

    return this.prisma.bankTransaction.update({
      where: { id: bankTransactionId },
      data: { status: 'UNRESOLVED' },
    });
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
