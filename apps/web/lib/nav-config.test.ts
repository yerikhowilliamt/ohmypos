import { describe, expect, it } from 'vitest';
import { getNavItems } from './nav-config';

describe('getNavItems', () => {
  it('returns Penjualan with children, Cuti, and Bantuan for KASIR', () => {
    const kasirItems = getNavItems('KASIR');
    expect(kasirItems.map((item) => item.href)).toEqual([
      '/sales',
      '/leave-requests',
      '/help',
    ]);
    expect(kasirItems[0].children).toEqual([
      { href: '/sales', label: 'Transaksi Kasir' },
      { href: '/sales/history', label: 'Riwayat Transaksi' },
    ]);
  });

  it('returns master-data with children, accounts, and reconciliation for ADMIN', () => {
    const adminItems = getNavItems('ADMIN');
    expect(adminItems.map((item) => item.href)).toEqual([
      '/master-data',
      '/accounts',
      '/reconciliation',
    ]);
    expect(
      adminItems.find((item) => item.href === '/master-data')?.children,
    ).toEqual([
      { href: '/master-data', label: 'Produk & Resep' },
      { href: '/master-data/raw-materials', label: 'Bahan Baku' },
    ]);
  });

  it('returns back-office routes with submenus for OWNER, dashboard first', () => {
    const items = getNavItems('OWNER');
    const hrefs = items.map((item) => item.href);
    expect(hrefs).toEqual([
      '/dashboard',
      '/sales',
      '/master-data',
      '/accounts',
      '/reconciliation',
      '/expenses',
      '/inventory',
      '/reports',
      '/users',
      '/branches',
      '/devices',
      '/leave-requests',
      '/help',
    ]);
    expect(hrefs[0]).toBe('/dashboard');
    expect(items.find((item) => item.href === '/sales')?.children).toEqual([
      { href: '/sales', label: 'Transaksi Kasir' },
      { href: '/sales/history', label: 'Riwayat Transaksi' },
    ]);
    expect(
      items.find((item) => item.href === '/master-data')?.children,
    ).toEqual([
      { href: '/master-data', label: 'Produk & Resep' },
      { href: '/master-data/raw-materials', label: 'Bahan Baku' },
    ]);
    expect(items.find((item) => item.href === '/expenses')?.children).toEqual([
      { href: '/expenses', label: 'Pengeluaran Umum' },
      { href: '/expenses/purchases', label: 'Pembelian' },
      { href: '/expenses/payables', label: 'Utang' },
    ]);
    expect(items.find((item) => item.href === '/reports')?.children).toEqual([
      { href: '/reports', label: 'Laba Rugi' },
      { href: '/reports/product-profit', label: 'Laba per Produk' },
      {
        href: '/reports/payment-methods',
        label: 'Pendapatan per Metode Bayar',
      },
      { href: '/reports/top-products', label: '10 Produk Terlaris' },
      { href: '/reports/daily', label: 'Pendapatan Harian' },
    ]);
    expect(items.find((item) => item.href === '/devices')?.children).toEqual([
      { href: '/devices', label: 'Daftar Perangkat' },
      { href: '/devices/attendance', label: 'Log Absensi' },
    ]);
  });

  it('does not expose /dashboard to ADMIN or KASIR', () => {
    expect(getNavItems('ADMIN').map((item) => item.href)).not.toContain(
      '/dashboard',
    );
    expect(getNavItems('KASIR').map((item) => item.href)).not.toContain(
      '/dashboard',
    );
  });

  it('does not expose /help to ADMIN', () => {
    expect(getNavItems('ADMIN').map((item) => item.href)).not.toContain(
      '/help',
    );
  });
});
