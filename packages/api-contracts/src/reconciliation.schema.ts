import { z } from 'zod';
import { TransactionStatus, TransactionType } from './enums';
import { DateTimeString, MoneyString, UuidString } from './primitives';
import { PaginationQuerySchema } from './pagination.schema';

/** Filters shared by the reconciliation dashboard's list and summary views. */
export const ReconciliationQuerySchema = PaginationQuerySchema.extend({
  accountId: UuidString.optional(),
  categoryId: UuidString.optional(),
  branchId: UuidString.optional(),
  type: TransactionType.optional(),
  status: TransactionStatus.optional(),
  startDate: DateTimeString.optional(),
  endDate: DateTimeString.optional(),
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
