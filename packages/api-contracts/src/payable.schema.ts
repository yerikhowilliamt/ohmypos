import { z } from 'zod';
import {
  DateTimeString,
  IdempotencyKey,
  MoneyString,
  UuidString,
} from './primitives';
import { PayableStatus } from './enums';
import { PaginationQuerySchema, SortOrderSchema } from './pagination.schema';

export const CreatePayableSettlementSchema = z.object({
  accountId: UuidString, // the account the payment came from (ERD §3)
  amount: MoneyString.refine((v) => Number(v) > 0, 'Harus lebih besar dari 0'),
  settledAt: DateTimeString,
  note: z.string().trim().max(500).optional(),
  idempotencyKey: IdempotencyKey.optional(),
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

// `supplierName` sorts through a nested orderBy on Supplier.
export const PayableSortBySchema = z.enum([
  'createdAt',
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
