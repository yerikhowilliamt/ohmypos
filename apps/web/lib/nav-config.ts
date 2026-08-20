import type { LucideIcon } from 'lucide-react';
import {
  Boxes,
  CalendarDays,
  ChartColumn,
  CircleHelp,
  LayoutDashboard,
  Package,
  Receipt,
  Scale,
  ShoppingCart,
  Store,
  Tablet,
  Users,
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
  /**
   * Required, not optional: at tablet width the sidebar is a 64px icon-only
   * rail (DESIGN.md §41.2) where the icon is the *only* thing rendered. An
   * item without one would be an unlabelled blank row.
   */
  icon: LucideIcon;
  children?: NavChildItem[];
  /**
   * DESIGN.md §16: "a group that is not yet available should carry a small
   * 'Coming soon' tag instead of being hidden". No item sets this today — it
   * exists so the next unfinished module is tagged rather than omitted, which
   * is what §16 asks for.
   */
  comingSoon?: boolean;
};

/**
 * Nav visibility mirrors the role → route mapping enforced server-side by
 * RoleGuard/BranchScopeGuard (System Design §5, ADR-011). This is UX only —
 * hiding a link a role can't reach — never the actual access control.
 */
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
    { href: '/leave-requests', label: 'Cuti', icon: CalendarDays },
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
    { href: '/inventory', label: 'Inventaris', icon: Boxes },
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
    { href: '/users', label: 'Pengguna', icon: Users },
    { href: '/branches', label: 'Cabang', icon: Store },
    {
      href: '/devices',
      label: 'Perangkat',
      icon: Tablet,
      children: [
        { href: '/devices', label: 'Daftar Perangkat' },
        { href: '/devices/attendance', label: 'Log Absensi' },
      ],
    },
    { href: '/leave-requests', label: 'Cuti', icon: CalendarDays },
    { href: '/help', label: 'Bantuan', icon: CircleHelp },
  ],
};

export function getNavItems(role: UserRole): NavItem[] {
  return NAV_ITEMS[role];
}

/**
 * A route is "on" a nav entry when it is that entry or lives beneath it, so
 * `/sales/history` keeps the `Penjualan` group marked as the active section.
 * Leaf children are compared with `===` at the call site instead, because
 * `/sales` is a prefix of `/sales/history` and both are leaves of the same
 * group — a prefix test there would light up two rows at once.
 */
export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * DESIGN.md §16's sidebar search: filters the nav list itself, not the app's
 * data. A parent that matches keeps all its children; a parent that does not
 * match survives only through the children that do, so searching "utang"
 * surfaces `Pengeluaran → Utang` rather than nothing.
 */
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
