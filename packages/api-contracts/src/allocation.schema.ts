import { z } from 'zod';
import { AllocationStatus } from './enums';
import { MoneyString, UuidString } from './primitives';

/**
 * One allocation line. Kasync accepted `amountPortion` as either a number or a
 * numeric string; OhMyPos accepts only the string form, because a JSON number
 * cannot carry a rupiah amount safely (Playbook §5).
 */
export const CreateSingleAllocationSchema = z.object({
  bankTransactionId: UuidString,
  ledgerEntryId: UuidString,
  amountPortion: MoneyString,
  idempotencyKey: z.string().trim().max(255).optional(),
});
export type CreateSingleAllocation = z.infer<
  typeof CreateSingleAllocationSchema
>;

/**
 * Accepts either a single allocation inline or a batch under `allocations`,
 * preserving Kasync's dual-shape request. Exactly one form must be supplied.
 */
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
