import {
  formatAccountType,
  formatAllocationStatus,
  formatLedgerSourceType,
  formatPaymentStatus,
  formatPayableStatus,
  formatStockDirection,
  formatStockReferenceType,
  formatStockStatus,
  formatTransactionStatus,
  formatTransactionType,
  ACCOUNT_TYPE_LABELS,
  ALLOCATION_STATUS_LABELS,
  LEDGER_SOURCE_TYPE_LABELS,
  PAYMENT_STATUS_LABELS,
  PAYABLE_STATUS_LABELS,
  STOCK_DIRECTION_LABELS,
  STOCK_REFERENCE_TYPE_LABELS,
  STOCK_STATUS_LABELS,
  TRANSACTION_STATUS_LABELS,
  TRANSACTION_TYPE_LABELS,
  type AccountType,
  type AllocationStatus,
  type LedgerSourceType,
  type PaymentStatus,
  type PayableStatus,
  type StockDirection,
  type StockReferenceType,
  type StockStatus,
  type TransactionStatus,
  type TransactionType,
} from '@ohmypos/api-contracts';

export {
  formatAccountType,
  formatAllocationStatus,
  formatLedgerSourceType,
  formatPaymentStatus,
  formatPayableStatus,
  formatStockDirection,
  formatStockReferenceType,
  formatStockStatus,
  formatTransactionStatus,
  formatTransactionType,
  ACCOUNT_TYPE_LABELS,
  ALLOCATION_STATUS_LABELS,
  LEDGER_SOURCE_TYPE_LABELS,
  PAYMENT_STATUS_LABELS,
  PAYABLE_STATUS_LABELS,
  STOCK_DIRECTION_LABELS,
  STOCK_REFERENCE_TYPE_LABELS,
  STOCK_STATUS_LABELS,
  TRANSACTION_STATUS_LABELS,
  TRANSACTION_TYPE_LABELS,
  type AccountType,
  type AllocationStatus,
  type LedgerSourceType,
  type PaymentStatus,
  type PayableStatus,
  type StockDirection,
  type StockReferenceType,
  type StockStatus,
  type TransactionStatus,
  type TransactionType,
};

/**
 * Returns Tailwind classes for Flow Indicator badge or text motif (DESIGN.md §9).
 */
export function getFlowIndicatorClasses(
  direction: TransactionType | StockDirection,
): string {
  if (direction === 'INFLOW' || direction === 'IN') {
    return 'text-accent-inflow';
  }
  return 'text-accent-outflow';
}

/**
 * Returns badge variant styling classes for stock status (DESIGN.md §9).
 */
export function getStockStatusBadgeClasses(status: StockStatus): string {
  switch (status) {
    case 'OK':
      return 'bg-status-success text-white border-transparent';
    case 'LOW':
      return 'bg-status-warning text-white border-transparent';
    case 'OUT':
      return 'bg-status-danger text-white border-transparent';
    default:
      return 'bg-surface-muted text-text-secondary border-border-default';
  }
}

/**
 * Returns badge variant styling classes for payment status.
 */
export function getPaymentStatusBadgeClasses(status: PaymentStatus): string {
  switch (status) {
    case 'PAID':
      return 'bg-status-success text-white border-transparent';
    case 'PARTIALLY_PAID':
      return 'bg-status-warning text-white border-transparent';
    case 'UNPAID':
      return 'bg-status-danger text-white border-transparent';
    default:
      return 'bg-surface-muted text-text-secondary border-border-default';
  }
}

/**
 * Returns badge variant styling classes for reconciliation transaction status.
 */
export function getTransactionStatusBadgeClasses(
  status: TransactionStatus,
): string {
  switch (status) {
    case 'MATCHED':
      return 'bg-status-success text-white border-transparent';
    case 'PARTIALLY_ALLOCATED':
      return 'bg-status-warning text-white border-transparent';
    case 'PENDING_REVIEW':
      return 'bg-status-info text-white border-transparent';
    case 'UNRESOLVED':
      return 'bg-status-danger text-white border-transparent';
    default:
      return 'bg-surface-muted text-text-secondary border-border-default';
  }
}
