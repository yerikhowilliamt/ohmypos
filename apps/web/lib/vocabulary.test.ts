import { describe, expect, it } from 'vitest';
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
  getFlowIndicatorClasses,
  getFlowIndicatorClassesForAmount,
  getPaymentStatusBadgeClasses,
  getStockStatusBadgeClasses,
  getTransactionStatusBadgeClasses,
} from './vocabulary';

describe('Indonesian Vocabulary Translation (DEBT-003)', () => {
  describe('TransactionType translation', () => {
    it('translates INFLOW to Pemasukan and OUTFLOW to Pengeluaran', () => {
      expect(formatTransactionType('INFLOW')).toBe('Pemasukan');
      expect(formatTransactionType('OUTFLOW')).toBe('Pengeluaran');
    });

    it('falls back to raw value if unknown string passed', () => {
      // @ts-expect-error testing invalid runtime value
      expect(formatTransactionType('UNKNOWN')).toBe('UNKNOWN');
    });
  });

  describe('StockDirection translation', () => {
    it('translates IN to Masuk and OUT to Keluar', () => {
      expect(formatStockDirection('IN')).toBe('Masuk');
      expect(formatStockDirection('OUT')).toBe('Keluar');
    });
  });

  describe('StockReferenceType translation', () => {
    it('translates all stock reference types accurately', () => {
      expect(formatStockReferenceType('SALE')).toBe('Penjualan');
      expect(formatStockReferenceType('PURCHASE')).toBe('Pembelian');
      expect(formatStockReferenceType('OPENING')).toBe('Stok Awal');
      expect(formatStockReferenceType('ADJUSTMENT')).toBe('Penyesuaian');
    });
  });

  describe('StockStatus translation', () => {
    it('translates stock status labels', () => {
      expect(formatStockStatus('OK')).toBe('Aman');
      expect(formatStockStatus('LOW')).toBe('Menipis');
      expect(formatStockStatus('OUT')).toBe('Habis');
    });
  });

  describe('PaymentStatus & PayableStatus translation', () => {
    it('translates PaymentStatus accurately', () => {
      expect(formatPaymentStatus('PAID')).toBe('Lunas');
      expect(formatPaymentStatus('UNPAID')).toBe('Belum Bayar');
      expect(formatPaymentStatus('PARTIALLY_PAID')).toBe('Sebagian');
    });

    it('translates PayableStatus accurately', () => {
      expect(formatPayableStatus('OPEN')).toBe('Belum Lunas');
      expect(formatPayableStatus('PARTIALLY_SETTLED')).toBe('Sebagian');
      expect(formatPayableStatus('SETTLED')).toBe('Lunas');
    });
  });

  describe('TransactionStatus (Reconciliation) translation', () => {
    it('translates all 4 transaction reconciliation status literals', () => {
      expect(formatTransactionStatus('UNRESOLVED')).toBe('Belum Cocok');
      expect(formatTransactionStatus('PENDING_REVIEW')).toBe('Perlu Ditinjau');
      expect(formatTransactionStatus('PARTIALLY_ALLOCATED')).toBe('Sebagian');
      expect(formatTransactionStatus('MATCHED')).toBe('Cocok');
    });
  });

  describe('LedgerSourceType, AllocationStatus, AccountType translation', () => {
    it('translates ledger source types', () => {
      expect(formatLedgerSourceType('MANUAL')).toBe('Manual');
      expect(formatLedgerSourceType('SALE')).toBe('Penjualan');
      expect(formatLedgerSourceType('PURCHASE')).toBe('Pembelian');
      expect(formatLedgerSourceType('PAYABLE_SETTLEMENT')).toBe(
        'Pelunasan Utang',
      );
    });

    it('translates allocation status', () => {
      expect(formatAllocationStatus('ACTIVE')).toBe('Aktif');
      expect(formatAllocationStatus('REVOKED')).toBe('Dibatalkan');
    });

    it('translates account type', () => {
      expect(formatAccountType('BANK')).toBe('Bank');
      expect(formatAccountType('CASH')).toBe('Kas Tunai');
      expect(formatAccountType('EWALLET')).toBe('E-Wallet');
    });
  });

  describe('Visual Flow Indicator and Badge Classes (DESIGN.md motif)', () => {
    it('returns green inflow text for INFLOW and IN', () => {
      expect(getFlowIndicatorClasses('INFLOW')).toBe('text-accent-inflow');
      expect(getFlowIndicatorClasses('IN')).toBe('text-accent-inflow');
    });

    it('returns blue outflow text for OUTFLOW and OUT', () => {
      expect(getFlowIndicatorClasses('OUTFLOW')).toBe('text-accent-outflow');
      expect(getFlowIndicatorClasses('OUT')).toBe('text-accent-outflow');
    });

    it('returns green inflow text for a positive or zero signed amount (report figures)', () => {
      expect(getFlowIndicatorClassesForAmount(96540000)).toBe(
        'text-accent-inflow',
      );
      expect(getFlowIndicatorClassesForAmount('96540000.00')).toBe(
        'text-accent-inflow',
      );
      expect(getFlowIndicatorClassesForAmount(0)).toBe('text-accent-inflow');
    });

    it('returns outflow text for a negative signed amount — a loss period (ADR-017 §2)', () => {
      expect(getFlowIndicatorClassesForAmount(-500000)).toBe(
        'text-accent-outflow',
      );
      expect(getFlowIndicatorClassesForAmount('-500000.00')).toBe(
        'text-accent-outflow',
      );
    });

    it('returns proper badge classes for StockStatus', () => {
      expect(getStockStatusBadgeClasses('OK')).toContain('bg-status-success');
      expect(getStockStatusBadgeClasses('OK')).toContain('text-white');
      expect(getStockStatusBadgeClasses('LOW')).toContain('bg-status-warning');
      expect(getStockStatusBadgeClasses('LOW')).toContain('text-white');
      expect(getStockStatusBadgeClasses('OUT')).toContain('bg-status-danger');
      expect(getStockStatusBadgeClasses('OUT')).toContain('text-white');
    });

    it('returns proper badge classes for PaymentStatus', () => {
      expect(getPaymentStatusBadgeClasses('PAID')).toContain(
        'bg-status-success',
      );
      expect(getPaymentStatusBadgeClasses('PAID')).toContain('text-white');
      expect(getPaymentStatusBadgeClasses('PARTIALLY_PAID')).toContain(
        'bg-status-warning',
      );
      expect(getPaymentStatusBadgeClasses('PARTIALLY_PAID')).toContain(
        'text-white',
      );
      expect(getPaymentStatusBadgeClasses('UNPAID')).toContain(
        'bg-status-danger',
      );
      expect(getPaymentStatusBadgeClasses('UNPAID')).toContain('text-white');
    });

    it('returns proper badge classes for TransactionStatus', () => {
      expect(getTransactionStatusBadgeClasses('MATCHED')).toContain(
        'bg-status-success',
      );
      expect(getTransactionStatusBadgeClasses('MATCHED')).toContain(
        'text-white',
      );
      expect(getTransactionStatusBadgeClasses('PARTIALLY_ALLOCATED')).toContain(
        'bg-status-warning',
      );
      expect(getTransactionStatusBadgeClasses('PARTIALLY_ALLOCATED')).toContain(
        'text-white',
      );
      expect(getTransactionStatusBadgeClasses('PENDING_REVIEW')).toContain(
        'bg-status-info',
      );
      expect(getTransactionStatusBadgeClasses('PENDING_REVIEW')).toContain(
        'text-white',
      );
      expect(getTransactionStatusBadgeClasses('UNRESOLVED')).toContain(
        'bg-status-danger',
      );
      expect(getTransactionStatusBadgeClasses('UNRESOLVED')).toContain(
        'text-white',
      );
    });
  });
});
