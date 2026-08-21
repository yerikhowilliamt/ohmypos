import type { TransactionType } from '../../../generated/prisma/enums';

/** Ported from Kasync — the strategy interface behind CSV import (PRD §5.7). */
export interface ParsedTransaction {
  txnDate: Date;
  /** Decimal carried as a string; never a float (Playbook §5). */
  amount: string;
  type: TransactionType;
  description: string;
  externalRef: string | null;
  dedupHash: string | null;
}

export interface BankParser {
  parse(
    fileBuffer: Buffer,
    options?: { password?: string },
  ): Promise<ParsedTransaction[]>;
}
