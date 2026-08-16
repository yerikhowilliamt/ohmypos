import type {
  AccountType,
  AllocationStatus,
  LedgerSourceType,
  PaymentStatus,
  PayableStatus,
  StockDirection,
  StockReferenceType,
  StockStatus,
  TransactionStatus,
  TransactionType,
} from './enums';

/**
 * OhMyPos Indonesian Vocabulary Mappings (DEBT-003).
 *
 * Centralizes the translation between backend schema enums (mirroring Kasync
 * conventions per ADR-012) and user-facing Indonesian presentation terms (PRD §5).
 */

export const TRANSACTION_TYPE_LABELS: Readonly<
  Record<TransactionType, string>
> = {
  INFLOW: 'Pemasukan',
  OUTFLOW: 'Pengeluaran',
};

export function formatTransactionType(type: TransactionType): string {
  return TRANSACTION_TYPE_LABELS[type] ?? type;
}

export const STOCK_DIRECTION_LABELS: Readonly<Record<StockDirection, string>> =
  {
    IN: 'Masuk',
    OUT: 'Keluar',
  };

export function formatStockDirection(direction: StockDirection): string {
  return STOCK_DIRECTION_LABELS[direction] ?? direction;
}

export const STOCK_REFERENCE_TYPE_LABELS: Readonly<
  Record<StockReferenceType, string>
> = {
  SALE: 'Penjualan',
  PURCHASE: 'Pembelian',
  OPENING: 'Stok Awal',
  ADJUSTMENT: 'Penyesuaian',
};

export function formatStockReferenceType(refType: StockReferenceType): string {
  return STOCK_REFERENCE_TYPE_LABELS[refType] ?? refType;
}

export const STOCK_STATUS_LABELS: Readonly<Record<StockStatus, string>> = {
  OK: 'Aman',
  LOW: 'Menipis',
  OUT: 'Habis',
};

export function formatStockStatus(status: StockStatus): string {
  return STOCK_STATUS_LABELS[status] ?? status;
}

export const PAYMENT_STATUS_LABELS: Readonly<Record<PaymentStatus, string>> = {
  PAID: 'Lunas',
  UNPAID: 'Belum Bayar',
  PARTIALLY_PAID: 'Sebagian',
};

export function formatPaymentStatus(status: PaymentStatus): string {
  return PAYMENT_STATUS_LABELS[status] ?? status;
}

export const PAYABLE_STATUS_LABELS: Readonly<Record<PayableStatus, string>> = {
  OPEN: 'Belum Lunas',
  PARTIALLY_SETTLED: 'Sebagian',
  SETTLED: 'Lunas',
};

export function formatPayableStatus(status: PayableStatus): string {
  return PAYABLE_STATUS_LABELS[status] ?? status;
}

export const TRANSACTION_STATUS_LABELS: Readonly<
  Record<TransactionStatus, string>
> = {
  UNRESOLVED: 'Belum Cocok',
  PENDING_REVIEW: 'Perlu Ditinjau',
  PARTIALLY_ALLOCATED: 'Sebagian',
  MATCHED: 'Cocok',
};

export function formatTransactionStatus(status: TransactionStatus): string {
  return TRANSACTION_STATUS_LABELS[status] ?? status;
}

export const LEDGER_SOURCE_TYPE_LABELS: Readonly<
  Record<LedgerSourceType, string>
> = {
  MANUAL: 'Manual',
  SALE: 'Penjualan',
  PURCHASE: 'Pembelian',
  PAYABLE_SETTLEMENT: 'Pelunasan Utang',
};

export function formatLedgerSourceType(source: LedgerSourceType): string {
  return LEDGER_SOURCE_TYPE_LABELS[source] ?? source;
}

export const ALLOCATION_STATUS_LABELS: Readonly<
  Record<AllocationStatus, string>
> = {
  ACTIVE: 'Aktif',
  REVOKED: 'Dibatalkan',
};

export function formatAllocationStatus(status: AllocationStatus): string {
  return ALLOCATION_STATUS_LABELS[status] ?? status;
}

export const ACCOUNT_TYPE_LABELS: Readonly<Record<AccountType, string>> = {
  BANK: 'Bank',
  CASH: 'Kas Tunai',
  EWALLET: 'E-Wallet',
};

export function formatAccountType(accountType: AccountType): string {
  return ACCOUNT_TYPE_LABELS[accountType] ?? accountType;
}
