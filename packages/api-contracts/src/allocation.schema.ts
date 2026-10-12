import { z } from 'zod';
import { AllocationStatus } from './enums';
import { LedgerEntryResponseSchema } from './ledger-entry.schema';
import { MoneyString, UuidString } from './primitives';

/** One allocation line. `amountPortion` is a string only. */
export const CreateSingleAllocationSchema = z.object({
  bankTransactionId: UuidString,
  ledgerEntryId: UuidString,
  amountPortion: MoneyString,
  idempotencyKey: z.string().trim().max(255).optional(),
});
export type CreateSingleAllocation = z.infer<
  typeof CreateSingleAllocationSchema
>;

/** A single inline allocation or a batch under `allocations`, not both. */
export const CreateAllocationSchema = z
  .object({
    bankTransactionId: UuidString.optional(),
    ledgerEntryId: UuidString.optional(),
    amountPortion: MoneyString.optional(),
    idempotencyKey: z.string().trim().max(255).optional(),
    allocations: z.array(CreateSingleAllocationSchema).min(1).optional(),
  })
  .refine(
    (dto) =>
      (dto.allocations && dto.allocations.length > 0) ||
      (dto.bankTransactionId && dto.ledgerEntryId && dto.amountPortion),
    {
      message:
        'Provide either `allocations`, or all of `bankTransactionId`, `ledgerEntryId` and `amountPortion`',
    },
  );
export type CreateAllocation = z.infer<typeof CreateAllocationSchema>;

export const AllocationResponseSchema = z.object({
  id: UuidString,
  bankTransactionId: UuidString,
  ledgerEntryId: UuidString,
  amountPortion: MoneyString,
  status: AllocationStatus,
  revokedAt: z.date().or(z.string()).nullable(),
  idempotencyKey: z.string().nullable(),
  createdAt: z.date().or(z.string()),
});
export type AllocationResponse = z.infer<typeof AllocationResponseSchema>;

/** Allocation with its ledger entry, as returned by the by-transaction list (DEBT-022). */
export const AllocationWithLedgerEntrySchema = AllocationResponseSchema.extend({
  ledgerEntry: LedgerEntryResponseSchema,
});
export type AllocationWithLedgerEntry = z.infer<
  typeof AllocationWithLedgerEntrySchema
>;
