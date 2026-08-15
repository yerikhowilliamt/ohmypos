import { z } from 'zod';
import { LedgerSourceType, TransactionType } from './enums';
import { DateTimeString, MoneyString, UuidString } from './primitives';
import {
  PaginationMetaSchema,
  PaginationQuerySchema,
} from './pagination.schema';

export const CreateLedgerEntrySchema = z.object({
  accountId: UuidString,
  categoryId: UuidString,
  /** Required — every entry is attributed to a branch (ADR-004). */
  branchId: UuidString,
  entryDate: DateTimeString,
  amount: MoneyString,
  type: TransactionType,
  note: z.string().trim().max(500).nullish(),
});
export type CreateLedgerEntry = z.infer<typeof CreateLedgerEntrySchema>;

export const UpdateLedgerEntrySchema = CreateLedgerEntrySchema.partial();
export type UpdateLedgerEntry = z.infer<typeof UpdateLedgerEntrySchema>;

export const LedgerEntryQuerySchema = PaginationQuerySchema.extend({
  branchId: UuidString.optional(),
  categoryId: UuidString.optional(),
  accountId: UuidString.optional(),
  type: TransactionType.optional(),
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
