import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { ImportResult } from '@ohmypos/api-contracts';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BankParserFactory } from './bank-parser.factory';

/**
 * Ported from Kasync with two changes: the `userId` scoping is gone
 * (ERD §7 note 1), and row validation no longer uses class-validator — the
 * parsers themselves already reject malformed rows, and ADR-010 removes
 * class-validator from the stack entirely.
 */
@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bankParserFactory: BankParserFactory,
  ) {}

  /** Parser-agnostic: the format key alone decides whether this is CSV or PDF. */
  async importStatement(
    accountId: string,
    format: string,
    fileBuffer: Buffer,
    options?: { password?: string },
  ): Promise<ImportResult> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new NotFoundException(
        'Akun pembayaran tidak ditemukan. Mungkin sudah dihapus — muat ulang halaman.',
      );
    }

    const parser = this.bankParserFactory.getParser(format);
    const rows = await parser.parse(fileBuffer, options);

    if (rows.length === 0) {
      return { imported: 0, skipped: 0, total: 0 };
    }

    // `skipDuplicates` leans on the (accountId, externalRef) and
    // (accountId, dedupHash) unique constraints — re-importing the same
    // statement is a no-op rather than a duplicate ledger (ERD §6).
    const result = await this.prisma.bankTransaction.createMany({
      data: rows.map((row) => ({
        accountId,
        txnDate: row.txnDate,
        amount: row.amount,
        type: row.type,
        description: row.description,
        externalRef: row.externalRef,
        dedupHash: row.dedupHash,
      })),
      skipDuplicates: true,
    });

    // Log counts and the account id only — never statement contents (Playbook §9).
    this.logger.log(
      `Imported ${result.count}/${rows.length} rows into account ${accountId}`,
    );

    return {
      imported: result.count,
      skipped: rows.length - result.count,
      total: rows.length,
    };
  }
}
