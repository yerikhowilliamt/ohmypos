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
  /**
   * Required, not optional: at tablet width the sidebar is a 64px icon-only
   * rail (DESIGN.md §13.1 Sidebar Behaviour by Breakpoint) where the icon is the *only* thing rendered. An
   * item without one would be an unlabelled blank row.
   */
  icon: LucideIcon;
  children?: NavChildItem[];
  /**
   * DESIGN.md §10.2 Sidebar Specifications: "a group that is not yet available should carry a small
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

/**
 * Backoffice topbar breadcrumb (DESIGN.md §10.3 Topbar Specifications "current page/context"). Reuses
 * the same role-aware label map as the sidebar instead of a second one, so the
 * two never drift. Returns `["Data Master", "Bahan Baku"]` for a child route,
 * `["Dashboard"]` for a flat one, or `[]` if the route isn't in the nav (e.g. a
 * page reached only via a row action, not the sidebar).
 */
export function getBreadcrumbSegments(
  pathname: string,
  role: UserRole,
): string[] {
  for (const item of getNavItems(role)) {
    if (item.children) {
      // An exact match always wins first: `/master-data` is a prefix of
      // `/master-data/raw-materials`, so a naive prefix test on the sibling
      // list would shadow the more specific child (same trap `isNavItemActive`'s
      // doc comment above already calls out for `/sales` vs `/sales/history`).
      // Only children with no exact hit fall back to a prefix test, and among
      // those the longest (most specific) href wins.
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
 * DESIGN.md §10.2 Sidebar Specifications's sidebar search: filters the nav list itself, not the app's
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
