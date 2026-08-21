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

/** Result of importing one bank statement CSV (PRD §5.7). */
export const ImportResultSchema = z.object({
  imported: z.number().int(),
  skipped: z.number().int(),
  total: z.number().int(),
});
export type ImportResult = z.infer<typeof ImportResultSchema>;
