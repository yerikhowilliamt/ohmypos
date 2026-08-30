import { describe, expect, it } from 'vitest';
import {
  filterNavItems,
  getNavItems,
  isNavItemActive,
  PLATFORM_NAV_ITEMS,
} from './nav-config';

describe('getNavItems', () => {
  it('returns Penjualan with children, Cuti, and Bantuan for KASIR', () => {
    const kasirItems = getNavItems('KASIR');
    expect(kasirItems.map((item) => item.href)).toEqual([
      '/sales',
      '/business/leave-requests',
      '/help',
    ]);
    expect(kasirItems[0].children).toEqual([
      { href: '/sales', label: 'Transaksi Penjualan' },
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
      {
        href: '/master-data/expense-categories',
        label: 'Kategori Pengeluaran',
      },
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
      '/business',
      '/help',
    ]);
    expect(hrefs[0]).toBe('/dashboard');
    expect(items.find((item) => item.href === '/sales')?.children).toEqual([
      { href: '/sales', label: 'Transaksi Penjualan' },
      { href: '/sales/history', label: 'Riwayat Transaksi' },
    ]);
    expect(
      items.find((item) => item.href === '/master-data')?.children,
    ).toEqual([
      { href: '/master-data', label: 'Produk & Resep' },
      { href: '/master-data/raw-materials', label: 'Bahan Baku' },
      {
        href: '/master-data/expense-categories',
        label: 'Kategori Pengeluaran',
      },
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
    expect(items.find((item) => item.href === '/business')?.children).toEqual([
      { href: '/business', label: 'Profil Bisnis' },
      { href: '/business/users', label: 'Pengguna' },
      { href: '/business/branches', label: 'Cabang' },
      { href: '/business/devices', label: 'Perangkat' },
      { href: '/business/devices/attendance', label: 'Log Absensi' },
      { href: '/business/leave-requests', label: 'Cuti' },
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

describe('nav item icons', () => {
  it('gives every top-level item an icon, for the tablet rail', () => {
    // DESIGN.md §13.1 Sidebar Behaviour by Breakpoint: at 768–1023px the icon is the only thing rendered.
    for (const role of ['KASIR', 'ADMIN', 'OWNER'] as const) {
      for (const item of getNavItems(role)) {
        expect(item.icon, `${role} → ${item.href} has no icon`).toBeDefined();
      }
    }
  });
});

describe('isNavItemActive', () => {
  it('matches the exact route', () => {
    expect(isNavItemActive('/sales', '/sales')).toBe(true);
  });

  it('matches a nested route, so the parent group stays active', () => {
    expect(isNavItemActive('/sales/history', '/sales')).toBe(true);
  });

  it('does not match a sibling that merely shares a prefix', () => {
    expect(isNavItemActive('/sales-report', '/sales')).toBe(false);
  });
});

describe('filterNavItems', () => {
  const owner = getNavItems('OWNER');

  it('returns everything for an empty or whitespace query', () => {
    expect(filterNavItems(owner, '')).toBe(owner);
    expect(filterNavItems(owner, '   ')).toBe(owner);
  });

  it('matches a top-level label case-insensitively and keeps its children', () => {
    const result = filterNavItems(owner, 'laporan');
    expect(result.map((item) => item.href)).toEqual(['/reports']);
    expect(result[0].children).toHaveLength(5);
  });

  it('surfaces a parent through a matching child, narrowed to that child', () => {
    const result = filterNavItems(owner, 'utang');
    expect(result.map((item) => item.href)).toEqual(['/expenses']);
    expect(result[0].children).toEqual([
      { href: '/expenses/payables', label: 'Utang' },
    ]);
  });

  it('returns an empty list when nothing matches', () => {
    expect(filterNavItems(owner, 'zzzz')).toEqual([]);
  });
});

describe('PLATFORM_NAV_ITEMS (ADR-025)', () => {
  it('lists the console destinations, all under /platform', () => {
    expect(PLATFORM_NAV_ITEMS.map((item) => item.href)).toEqual([
      '/platform',
      '/platform/tenants',
    ]);
  });

  it('never leaks into a tenant role\u2019s nav', () => {
    // A super admin is not a UserRole (ADR-025 Decision 5). If these ever
    // merged, a shop OWNER's sidebar would carry a link into the console.
    for (const role of ['KASIR', 'ADMIN', 'OWNER'] as const) {
      const hrefs = getNavItems(role).map((item) => item.href);
      expect(hrefs.some((href) => href.startsWith('/platform'))).toBe(false);
    }
  });

  it('is flat \u2014 the console has no nested groups to expand', () => {
    for (const item of PLATFORM_NAV_ITEMS) {
      expect(item.children).toBeUndefined();
      expect(item.icon).toBeDefined();
    }
  });
});
