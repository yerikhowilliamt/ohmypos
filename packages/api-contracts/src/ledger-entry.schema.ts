import { z } from 'zod';
import { LedgerSourceType, TransactionType } from './enums';
import { DateTimeString, MoneyString, UuidString } from './primitives';
import {
  PaginationMetaSchema,
  PaginationQuerySchema,
  SortOrderSchema,
} from './pagination.schema';

export const CreateLedgerEntrySchema = z.object({
  accountId: UuidString,
  categoryId: UuidString,
  /**
   * Required-nullable: a UUID targets a branch; null asks the backend to
   * attribute the entry to the seeded central-operation branch. The persisted
   * LedgerEntry.branchId remains non-null (ADR-004, ADR-014).
   */
  branchId: UuidString.nullable(),
  entryDate: DateTimeString,
  amount: MoneyString,
  type: TransactionType,
  note: z.string().trim().max(500).nullish(),
});
export type CreateLedgerEntry = z.infer<typeof CreateLedgerEntrySchema>;

export const UpdateLedgerEntrySchema = CreateLedgerEntrySchema.partial();
export type UpdateLedgerEntry = z.infer<typeof UpdateLedgerEntrySchema>;

export const LedgerEntrySortBySchema = z.enum([
  'entryDate',
  'amount',
  'createdAt',
]);
export type LedgerEntrySortBy = z.infer<typeof LedgerEntrySortBySchema>;

export const LedgerEntryQuerySchema = PaginationQuerySchema.extend({
  branchId: UuidString.optional(),
  categoryId: UuidString.optional(),
  accountId: UuidString.optional(),
  type: TransactionType.optional(),
  sortBy: LedgerEntrySortBySchema.optional(),
  sortOrder: SortOrderSchema.optional(),
  /**
   * Inclusive `entryDate` bounds (ADR-019 / Reconciliation split-allocation
   * candidate picker). Independent of each other — either may be supplied
   * alone.
   */
  startDate: DateTimeString.optional(),
  endDate: DateTimeString.optional(),
});
export type LedgerEntryQuery = z.infer<typeof LedgerEntryQuerySchema>;

export const LedgerEntryResponseSchema = z.object({
  id: UuidString,
  accountId: UuidString,
  categoryId: UuidString,
  branchId: UuidString,
  entryDate: z.date().or(z.string()),
  amount: MoneyString,
  type: TransactionType,
  sourceType: LedgerSourceType,
  sourceId: UuidString.nullable(),
  note: z.string().nullable(),
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
});
export type LedgerEntryResponse = z.infer<typeof LedgerEntryResponseSchema>;

export const PaginatedLedgerEntriesSchema = z.object({
  data: z.array(LedgerEntryResponseSchema),
  meta: PaginationMetaSchema,
});
export type PaginatedLedgerEntries = z.infer<
  typeof PaginatedLedgerEntriesSchema
>;
