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
    { href: '/leave-requests', label: 'Cuti' },
  ],
  ADMIN: [
    {
      href: '/master-data',
      label: 'Data Master',
      children: [
        { href: '/master-data', label: 'Produk & Resep' },
        { href: '/master-data/raw-materials', label: 'Bahan Baku' },
      ],
    },
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
    {
      href: '/master-data',
      label: 'Data Master',
      children: [
        { href: '/master-data', label: 'Produk & Resep' },
        { href: '/master-data/raw-materials', label: 'Bahan Baku' },
      ],
    },
    { href: '/accounts', label: 'Metode Pembayaran' },
    { href: '/reconciliation', label: 'Rekonsiliasi' },
    {
      href: '/expenses',
      label: 'Pengeluaran',
      children: [
        { href: '/expenses', label: 'Pengeluaran Umum' },
        { href: '/expenses/purchases', label: 'Pembelian' },
        { href: '/expenses/payables', label: 'Utang' },
      ],
    },
    { href: '/inventory', label: 'Inventaris' },
    {
      href: '/reports',
      label: 'Laporan',
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
    { href: '/users', label: 'Pengguna' },
    { href: '/branches', label: 'Cabang' },
    {
      href: '/devices',
      label: 'Perangkat',
      children: [
        { href: '/devices', label: 'Daftar Perangkat' },
        { href: '/devices/attendance', label: 'Log Absensi' },
      ],
    },
    { href: '/leave-requests', label: 'Cuti' },
  ],
};

export function getNavItems(role: UserRole): NavItem[] {
  return NAV_ITEMS[role];
}
