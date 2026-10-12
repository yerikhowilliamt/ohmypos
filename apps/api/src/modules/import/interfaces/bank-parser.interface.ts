import type { TransactionType } from '../../../generated/prisma/enums';

export interface ParsedTransaction {
  txnDate: Date;
  /** Decimal string, never a float. */
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
