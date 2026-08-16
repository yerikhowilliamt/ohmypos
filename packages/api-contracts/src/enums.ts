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

/** OhMyPos — SupplierPurchase.paymentStatus (ERD §3). */
export const PaymentStatus = z.enum(['PAID', 'UNPAID', 'PARTIALLY_PAID']);
export type PaymentStatus = z.infer<typeof PaymentStatus>;

/**
 * The subset a client may send when CREATING a purchase. `PARTIALLY_PAID` is
 * unreachable at creation: ADR-006 makes the branch binary (ledger entry XOR
 * payable), and ERD §6 states the two are mutually exclusive at creation time.
 * The settlement flow is what widens the stored value to PARTIALLY_PAID (§4).
 */
export const PurchasePaymentStatusInput = z.enum(['PAID', 'UNPAID']);
export type PurchasePaymentStatusInput = z.infer<
  typeof PurchasePaymentStatusInput
>;

export const PayableStatus = z.enum(['OPEN', 'PARTIALLY_SETTLED', 'SETTLED']);
export type PayableStatus = z.infer<typeof PayableStatus>;

export const StockDirection = z.enum(['IN', 'OUT']);
export type StockDirection = z.infer<typeof StockDirection>;

export const StockReferenceType = z.enum([
  'SALE',
  'PURCHASE',
  'OPENING',
  'ADJUSTMENT',
]);
export type StockReferenceType = z.infer<typeof StockReferenceType>;

/**
 * OhMyPos — Dashboard 5's automatic stock badge (PRD §5.6). Computed at query
 * time from closing stock versus `RawMaterial.lowStockThreshold`; never stored,
 * because a stored status is a second source of truth that can drift (ADR-008).
 */
export const StockStatus = z.enum(['OK', 'LOW', 'OUT']);
export type StockStatus = z.infer<typeof StockStatus>;
