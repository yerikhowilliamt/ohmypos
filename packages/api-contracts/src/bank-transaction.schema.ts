import { z } from 'zod';
import { TransactionStatus, TransactionType } from './enums';
import { DateTimeString, MoneyString, UuidString } from './primitives';
import {
  PaginationMetaSchema,
  PaginationQuerySchema,
} from './pagination.schema';

export const CreateBankTransactionSchema = z.object({
  accountId: UuidString,
  txnDate: DateTimeString,
  amount: MoneyString,
  type: TransactionType,
  description: z.string().trim().min(1).max(500),
  externalRef: z.string().trim().max(255).nullish(),
});
export type CreateBankTransaction = z.infer<typeof CreateBankTransactionSchema>;

export const BankTransactionSortBySchema = z.enum([
  'txnDate',
  'amount',
  'createdAt',
]);
export type BankTransactionSortBy = z.infer<typeof BankTransactionSortBySchema>;

export const BankTransactionQuerySchema = PaginationQuerySchema.extend({
  accountId: UuidString.optional(),
  status: TransactionStatus.optional(),
  sortBy: BankTransactionSortBySchema.optional(),
});
export type BankTransactionQuery = z.infer<typeof BankTransactionQuerySchema>;

export const BankTransactionResponseSchema = z.object({
  id: UuidString,
  accountId: UuidString,
  txnDate: z.date().or(z.string()),
  amount: MoneyString,
  type: TransactionType,
  description: z.string(),
  externalRef: z.string().nullable(),
  status: TransactionStatus,
  importedAt: z.date().or(z.string()),
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
});
export type BankTransactionResponse = z.infer<
  typeof BankTransactionResponseSchema
>;

export const PaginatedBankTransactionsSchema = z.object({
  data: z.array(BankTransactionResponseSchema),
  meta: PaginationMetaSchema,
});
export type PaginatedBankTransactions = z.infer<
  typeof PaginatedBankTransactionsSchema
>;

/**
 * Statement formats `BankParserFactory` supports. Kept here so the API switch
 * and the web format picker read from one list instead of drifting apart.
 */
export const BankImportFormatSchema = z.enum(['BCA', 'MANDIRI', 'MANDIRI_PDF']);
export type BankImportFormat = z.infer<typeof BankImportFormatSchema>;

/**
 * Presentation metadata for each format. `container` selects the upload route
 * and `accept` drives the file picker, so the UI needs no bank/file-type matrix.
 */
export const BANK_IMPORT_FORMATS = [
  {
    value: 'BCA',
    label: 'BCA (CSV)',
    container: 'csv',
    accept: '.csv,text/csv',
  },
  {
    value: 'MANDIRI',
    label: 'Mandiri (CSV)',
    container: 'csv',
    accept: '.csv,text/csv',
  },
  {
    value: 'MANDIRI_PDF',
    label: 'Mandiri (PDF e-Statement)',
    container: 'pdf',
    accept: '.pdf,application/pdf',
  },
] as const satisfies ReadonlyArray<{
  value: BankImportFormat;
  label: string;
  container: 'csv' | 'pdf';
  accept: string;
}>;

export const ImportPdfQuerySchema = z.object({
  format: BankImportFormatSchema,
  password: z.string().optional(),
});
export type ImportPdfQuery = z.infer<typeof ImportPdfQuerySchema>;

/** Result of importing one bank statement, CSV or PDF (PRD §5.7). */
export const ImportResultSchema = z.object({
  imported: z.number().int(),
  skipped: z.number().int(),
  total: z.number().int(),
});
export type ImportResult = z.infer<typeof ImportResultSchema>;
