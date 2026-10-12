import { z } from 'zod';

/** Mirrors `schema.prisma`, which keeps Kasync's literal names. Do not rename (ADR-012). */

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

/** What generated a `LedgerEntry`. `SALE_VOID` is a void's reversal entry (DEBT-010). */
export const LedgerSourceType = z.enum([
  'MANUAL',
  'SALE',
  'PURCHASE',
  'PAYABLE_SETTLEMENT',
  'SALE_VOID',
]);
export type LedgerSourceType = z.infer<typeof LedgerSourceType>;

/** `SupplierPurchase.paymentStatus`. */
export const PaymentStatus = z.enum(['PAID', 'UNPAID', 'PARTIALLY_PAID']);
export type PaymentStatus = z.infer<typeof PaymentStatus>;

/** Statuses allowed at creation; `PARTIALLY_PAID` comes only from settlements (ADR-006). */
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

/** Dashboard 5 stock badge, computed at query time and never stored. */
export const StockStatus = z.enum(['OK', 'LOW', 'OUT']);
export type StockStatus = z.infer<typeof StockStatus>;
