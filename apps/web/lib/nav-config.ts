import type { LucideIcon } from 'lucide-react';
import {
  Boxes,
  Building2,
  CalendarDays,
  ChartColumn,
  CircleHelp,
  LayoutDashboard,
  Package,
  Receipt,
  Scale,
  ShoppingCart,
  Wallet,
} from 'lucide-react';
import type { UserRole } from '@ohmypos/api-contracts';

export type NavChildItem = {
  href: string;
  label: string;
};

export type NavItem = {
  href: string;
  label: string;
  /** Required: the tablet rail renders icons only (design.md §13.1). */
  icon: LucideIcon;
  children?: NavChildItem[];
  /** Tags an unfinished module "Coming soon" instead of hiding it (design.md §10.2). Unused today. */
  comingSoon?: boolean;
};

/** Nav per role, mirroring server-side access (ADR-011). UX only, never access control. */
const NAV_ITEMS: Record<UserRole, NavItem[]> = {
  KASIR: [
    {
      href: '/sales',
      label: 'Penjualan',
      icon: ShoppingCart,
      children: [
        { href: '/sales', label: 'Transaksi Penjualan' },
        { href: '/sales/history', label: 'Riwayat Transaksi' },
      ],
    },
    { href: '/business/leave-requests', label: 'Cuti', icon: CalendarDays },
    { href: '/help', label: 'Bantuan', icon: CircleHelp },
  ],
  ADMIN: [
    {
      href: '/master-data',
      label: 'Data Master',
      icon: Package,
      children: [
        { href: '/master-data', label: 'Produk & Resep' },
        { href: '/master-data/raw-materials', label: 'Bahan Baku' },
        {
          href: '/master-data/expense-categories',
          label: 'Kategori Pengeluaran',
        },
      ],
    },
    { href: '/accounts', label: 'Metode Pembayaran', icon: Wallet },
    { href: '/reconciliation', label: 'Rekonsiliasi', icon: Scale },
  ],
  OWNER: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    {
      href: '/sales',
      label: 'Penjualan',
      icon: ShoppingCart,
      children: [
        { href: '/sales', label: 'Transaksi Penjualan' },
        { href: '/sales/history', label: 'Riwayat Transaksi' },
      ],
    },
    {
      href: '/master-data',
      label: 'Data Master',
      icon: Package,
      children: [
        { href: '/master-data', label: 'Produk & Resep' },
        { href: '/master-data/raw-materials', label: 'Bahan Baku' },
        {
          href: '/master-data/expense-categories',
          label: 'Kategori Pengeluaran',
        },
      ],
    },
    { href: '/accounts', label: 'Metode Pembayaran', icon: Wallet },
    { href: '/reconciliation', label: 'Rekonsiliasi', icon: Scale },
    {
      href: '/expenses',
      label: 'Pengeluaran',
      icon: Receipt,
      children: [
        { href: '/expenses', label: 'Pengeluaran Umum' },
        { href: '/expenses/purchases', label: 'Pembelian' },
        { href: '/expenses/payables', label: 'Utang' },
      ],
    },
    {
      href: '/inventory',
      label: 'Inventaris',
      icon: Boxes,
      children: [
        { href: '/inventory', label: 'Ringkasan & Stok Awal' },
        { href: '/inventory/movements', label: 'Riwayat Pergerakan' },
      ],
    },
    {
      href: '/reports',
      label: 'Laporan',
      icon: ChartColumn,
      children: [
        { href: '/reports', label: 'Laba Rugi' },
        { href: '/reports/product-profit', label: 'Laba per Produk' },
        {
          href: '/reports/payment-methods',
          label: 'Pendapatan per Metode Bayar',
        },
        { href: '/reports/top-products', label: '10 Produk Terlaris' },
        { href: '/reports/daily', label: 'Pendapatan Harian' },
      ],
    },
    {
      href: '/business',
      label: 'Bisnis',
      icon: Building2,
      children: [
        { href: '/business', label: 'Profil Bisnis' },
        { href: '/business/users', label: 'Pengguna' },
        { href: '/business/branches', label: 'Cabang' },
        { href: '/business/devices', label: 'Perangkat' },
        { href: '/business/devices/attendance', label: 'Log Absensi' },
        { href: '/business/leave-requests', label: 'Cuti' },
      ],
    },
    { href: '/help', label: 'Bantuan', icon: CircleHelp },
  ],
};

export function getNavItems(role: UserRole): NavItem[] {
  return NAV_ITEMS[role];
}

/** Topbar breadcrumb from the same role-aware nav map; `[]` for routes outside the nav. */
export function getBreadcrumbSegments(
  pathname: string,
  role: UserRole,
): string[] {
  for (const item of getNavItems(role)) {
    if (item.children) {
      // Exact match first, then the longest prefix, so a parent never shadows a child.
      const exact = item.children.find((c) => pathname === c.href);
      if (exact) return [item.label, exact.label];
      const prefixed = item.children.filter((c) =>
        pathname.startsWith(`${c.href}/`),
      );
      if (prefixed.length > 0) {
        const best = prefixed.reduce((a, b) =>
          b.href.length > a.href.length ? b : a,
        );
        return [item.label, best.label];
      }
      continue;
    }
    if (isNavItemActive(pathname, item.href)) return [item.label];
  }
  return [];
}

/** Section-level active check (prefix). Leaf items are compared with `===` at the call site. */
export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Sidebar search over the nav itself; a matching child keeps its parent visible. */
export function filterNavItems(items: NavItem[], query: string): NavItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;

  const matched: NavItem[] = [];
  for (const item of items) {
    if (item.label.toLowerCase().includes(needle)) {
      matched.push(item);
      continue;
    }
    const children = item.children?.filter((child) =>
      child.label.toLowerCase().includes(needle),
    );
    if (children && children.length > 0) {
      matched.push({ ...item, children });
    }
  }
  return matched;
}

/** Platform console nav. Separate from `NAV_ITEMS` because a platform admin is not a `UserRole` (ADR-025). */
export const PLATFORM_NAV_ITEMS: NavItem[] = [
  { href: '/platform', label: 'Ringkasan', icon: LayoutDashboard },
  { href: '/platform/tenants', label: 'Tenant', icon: Building2 },
];
