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
      return 'bg-status-success/10 text-status-success border-status-success/20';
    case 'LOW':
      return 'bg-status-warning/10 text-status-warning border-status-warning/20';
    case 'OUT':
      return 'bg-status-danger/10 text-status-danger border-status-danger/20';
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
      return 'bg-status-success/10 text-status-success border-status-success/20';
    case 'PARTIALLY_PAID':
      return 'bg-status-warning/10 text-status-warning border-status-warning/20';
    case 'UNPAID':
      return 'bg-status-danger/10 text-status-danger border-status-danger/20';
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
      return 'bg-status-success/10 text-status-success border-status-success/20';
    case 'PARTIALLY_ALLOCATED':
      return 'bg-status-warning/10 text-status-warning border-status-warning/20';
    case 'PENDING_REVIEW':
      return 'bg-status-info/10 text-status-info border-status-info/20';
    case 'UNRESOLVED':
      return 'bg-status-danger/10 text-status-danger border-status-danger/20';
    default:
      return 'bg-surface-muted text-text-secondary border-border-default';
  }
}
