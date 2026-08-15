import { z } from 'zod';

/**
 * Enum values mirror `apps/api/prisma/schema.prisma`, which per ADR-012 keeps
 * Kasync's literal names. `INFLOW`/`OUTFLOW` are deliberately NOT renamed to
 * income/expense — `AllocationService` and `MatchingEngine` compare this field
 * directly across `BankTransaction` and `LedgerEntry`. The Indonesian product
 * vocabulary (pemasukan/pengeluaran) is applied in the UI, not here (DEBT-003).
 */

export const AccountType = z.enum(['BANK', 'CASH', 'EWALLET']);
export type AccountType = z.infer<typeof AccountType>;

export const TransactionType = z.enum(['INFLOW', 'OUTFLOW']);
export type TransactionType = z.infer<typeof TransactionType>;

/** Written by `trg_sync_transaction_status` — do not rename (ADR-012). */
export const TransactionStatus = z.enum([
  'UNRESOLVED',
  'PENDING_REVIEW',
  'PARTIALLY_ALLOCATED',
  'MATCHED',
]);
export type TransactionStatus = z.infer<typeof TransactionStatus>;

export const AllocationStatus = z.enum(['ACTIVE', 'REVOKED']);
export type AllocationStatus = z.infer<typeof AllocationStatus>;

/** OhMyPos-only: what generated a `LedgerEntry` (ERD §2). */
export const LedgerSourceType = z.enum([
  'MANUAL',
  'SALE',
  'PURCHASE',
  'PAYABLE_SETTLEMENT',
]);
export type LedgerSourceType = z.infer<typeof LedgerSourceType>;
