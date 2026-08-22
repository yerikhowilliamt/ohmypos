import { z } from 'zod';
import { DateTimeString, MoneyString, UuidString } from './primitives';
import { PayableStatus } from './enums';
import { PaginationQuerySchema, SortOrderSchema } from './pagination.schema';

/**
 * OhMyPos — Payable and PayableSettlement contracts (ERD §3, ADR-006, PRD §5.3).
 */
export const CreatePayableSettlementSchema = z.object({
  accountId: UuidString, // the account the payment came from (ERD §3)
  amount: MoneyString.refine((v) => Number(v) > 0, 'must be greater than zero'),
  settledAt: DateTimeString,
  note: z.string().trim().max(500).optional(),
});
export type CreatePayableSettlement = z.infer<
  typeof CreatePayableSettlementSchema
>;

export const PayableSettlementResponseSchema = z.object({
  id: UuidString,
  payableId: UuidString,
  accountId: UuidString,
  ledgerEntryId: UuidString,
  amount: MoneyString,
  settledAt: DateTimeString,
  note: z.string().nullable(),
  createdAt: DateTimeString,
});
export type PayableSettlementResponse = z.infer<
  typeof PayableSettlementResponseSchema
>;

export const PayableResponseSchema = z.object({
  id: UuidString,
  supplierPurchaseId: UuidString,
  supplierId: UuidString,
  supplierName: z.string(),
  originalAmount: MoneyString,
  remainingBalance: MoneyString,
  settledAmount: MoneyString,
  status: PayableStatus,
  settlements: z.array(PayableSettlementResponseSchema),
  createdAt: DateTimeString,
  updatedAt: DateTimeString,
});
export type PayableResponse = z.infer<typeof PayableResponseSchema>;

export const PayableSupplierSummarySchema = z.object({
  supplierId: UuidString,
  supplierName: z.string(),
  openPayableCount: z.number().int(),
  totalOutstanding: MoneyString,
});
export type PayableSupplierSummary = z.infer<
  typeof PayableSupplierSummarySchema
>;

// `supplierName` and `status` were added when the Payables tab moved to
// server-side sorting: both columns already offered a sort header, and dropping
// the affordance would have been a UX regression. `supplierName` is not a
// Payable column — see PayablesService.findAll for its nested orderBy.
export const PayableSortBySchema = z.enum([
  'createdAt',
  'dueDate',
  'originalAmount',
  'remainingBalance',
  'supplierName',
  'status',
]);
export type PayableSortBy = z.infer<typeof PayableSortBySchema>;

export const PayableQuerySchema = PaginationQuerySchema.extend({
  supplierId: UuidString.optional(),
  status: PayableStatus.optional(),
  sortBy: PayableSortBySchema.optional(),
  sortOrder: SortOrderSchema.optional(),
});
export type PayableQuery = z.infer<typeof PayableQuerySchema>;
