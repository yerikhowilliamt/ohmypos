import { z } from 'zod';
import { TransactionStatus, TransactionType } from './enums';
import { DateTimeString, MoneyString, UuidString } from './primitives';
import { PaginationQuerySchema, SortOrderSchema } from './pagination.schema';

// `description` was added when the reconciliation table moved to server-side
// sorting (TASK-068): the column already had a sort header whose clicks never
// reached the API. It is a plain String column on BankTransaction.
export const ReconciliationSortBySchema = z.enum([
  'txnDate',
  'amount',
  'createdAt',
  'description',
]);
export type ReconciliationSortBy = z.infer<typeof ReconciliationSortBySchema>;

/** Filters shared by the reconciliation dashboard's list and summary views. */
export const ReconciliationQuerySchema = PaginationQuerySchema.extend({
  accountId: UuidString.optional(),
  categoryId: UuidString.optional(),
  branchId: UuidString.optional(),
  type: TransactionType.optional(),
  status: TransactionStatus.optional(),
  startDate: DateTimeString.optional(),
  endDate: DateTimeString.optional(),
  sortBy: ReconciliationSortBySchema.optional(),
  sortOrder: SortOrderSchema.optional(),
});
export type ReconciliationQuery = z.infer<typeof ReconciliationQuerySchema>;

export const ReconciliationSummarySchema = z.object({
  counts: z.object({
    UNRESOLVED: z.number().int(),
    PENDING_REVIEW: z.number().int(),
    PARTIALLY_ALLOCATED: z.number().int(),
    MATCHED: z.number().int(),
  }),
  actualBankBalance: MoneyString,
  recordedLedgerBalance: MoneyString,
  variance: MoneyString,
});
export type ReconciliationSummary = z.infer<typeof ReconciliationSummarySchema>;
