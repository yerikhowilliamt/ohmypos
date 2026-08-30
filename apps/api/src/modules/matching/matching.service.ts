import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ProposeMatches } from '@ohmypos/api-contracts';
import Decimal from 'decimal.js';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { requireTenantId } from '../../common/prisma/tenant-context';
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
    return this.prisma.$transaction(
      async (tx) => {
        // DEF-QA-03: lock the UNRESOLVED rows this call is about to propose
        // against, before reading them, and skip any a concurrent propose is
        // already holding. Without this, two admins opening Reconciliation at
        // the same time both read the same UNRESOLVED set, both compute
        // candidates against it, and both race the terminal `updateMany` below
        // — one reviewer's queue silently contains transactions the other one
        // just proposed against too.
        const accountFilter = dto?.accountId
          ? Prisma.sql` AND account_id = ${dto.accountId}`
          : Prisma.empty;
        // ADR-025: the tenant predicate is NOT optional here. Without it this
        // query locks every tenant's UNRESOLVED rows — the follow-up findMany
        // is tenant-filtered so nothing leaks into the response, but one
        // tenant's Reconciliation page would hold locks across the whole
        // platform for the length of this transaction.
        const lockedIds = await tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT id FROM bank_transactions WHERE tenant_id = ${requireTenantId()} AND status = 'UNRESOLVED'${accountFilter} FOR UPDATE SKIP LOCKED`,
        );

        if (lockedIds.length === 0) {
          return { candidates: [], truncated: false };
        }

        const bankTxns = await tx.bankTransaction.findMany({
          where: { id: { in: lockedIds.map((row) => row.id) } },
        });

        // Scope ledger entries to a window around the bank transactions rather
        // than loading all history.
        const tolerance = dto?.dateToleranceDays ?? 3;
        const dates = bankTxns.map((t) => new Date(t.txnDate).getTime());
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

        const ledgerEntries = await tx.ledgerEntry.findMany({
          where: { entryDate: { gte: minDate, lte: maxDate } },
          orderBy: { entryDate: 'asc' },
          take: MAX_LEDGER_WINDOW,
        });

        const bankInputs: BankTransactionInput[] = bankTxns.map((t) => ({
          id: t.id,
          amount: new Decimal(t.amount.toString()),
          type: t.type,
          txnDate: new Date(t.txnDate),
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
          await tx.bankTransaction.updateMany({
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
      },
      { maxWait: 5000, timeout: 15000 },
    );
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
        'Mutasi bank tidak ditemukan. Mungkin sudah dihapus — muat ulang halaman.',
      );
    }

    if (transaction.status !== 'PENDING_REVIEW') {
      throw new ConflictException(
        'Mutasi bank ini sudah tidak menunggu peninjauan. Muat ulang halaman untuk melihat statusnya yang terbaru.',
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
