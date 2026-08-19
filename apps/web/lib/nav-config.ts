import type { UserRole } from '@ohmypos/api-contracts';

export type NavChildItem = {
  href: string;
  label: string;
};

export type NavItem = {
  href: string;
  label: string;
  children?: NavChildItem[];
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
      children: [
        { href: '/sales', label: 'Transaksi Kasir' },
        { href: '/sales/history', label: 'Riwayat Transaksi' },
      ],
    },
  ],
  ADMIN: [
    { href: '/master-data', label: 'Data Master' },
    { href: '/accounts', label: 'Metode Pembayaran' },
    { href: '/reconciliation', label: 'Rekonsiliasi' },
  ],
  OWNER: [
    { href: '/dashboard', label: 'Dashboard' },
    {
      href: '/sales',
      label: 'Penjualan',
      children: [
        { href: '/sales', label: 'Transaksi Kasir' },
        { href: '/sales/history', label: 'Riwayat Transaksi' },
      ],
    },
    { href: '/master-data', label: 'Data Master' },
    { href: '/accounts', label: 'Metode Pembayaran' },
    { href: '/reconciliation', label: 'Rekonsiliasi' },
    { href: '/expenses', label: 'Pengeluaran' },
    { href: '/inventory', label: 'Inventaris' },
    { href: '/reports', label: 'Laporan' },
    { href: '/users', label: 'Pengguna' },
    { href: '/branches', label: 'Cabang' },
  ],
};

export function getNavItems(role: UserRole): NavItem[] {
  return NAV_ITEMS[role];
}
