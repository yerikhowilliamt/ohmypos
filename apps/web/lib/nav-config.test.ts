import { describe, expect, it } from 'vitest';
import { getNavItems } from './nav-config';

describe('getNavItems', () => {
  it('returns Penjualan with children for KASIR', () => {
    const kasirItems = getNavItems('KASIR');
    expect(kasirItems.map((item) => item.href)).toEqual(['/sales']);
    expect(kasirItems[0].children).toEqual([
      { href: '/sales', label: 'Transaksi Kasir' },
      { href: '/sales/history', label: 'Riwayat Transaksi' },
    ]);
  });

  it('returns master-data, accounts, and reconciliation for ADMIN', () => {
    expect(getNavItems('ADMIN').map((item) => item.href)).toEqual([
      '/master-data',
      '/accounts',
      '/reconciliation',
    ]);
  });

  it('returns back-office routes with Penjualan for OWNER, dashboard first', () => {
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
    ]);
    expect(hrefs[0]).toBe('/dashboard');
    expect(items.find((item) => item.href === '/sales')?.children).toEqual([
      { href: '/sales', label: 'Transaksi Kasir' },
      { href: '/sales/history', label: 'Riwayat Transaksi' },
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
});
