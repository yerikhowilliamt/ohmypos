import { redirect } from 'next/navigation';
import { PosScreen } from '@/components/pos/PosScreen';
import { getSession } from '@/lib/session';

/**
 * POS / Sales Entry (PRD §5.2, DESIGN.md §20).
 * Accessible by KASIR and OWNER. For KASIR, user.branchId is required.
 * For OWNER, if user.branchId is not set, they are prompted or can access via branch selection.
 */
export default async function SalesPage() {
  const user = await getSession();

  if (!user) {
    redirect('/login');
  }

  // ADR-011 §2: `branchId` is required when `role = KASIR`.
  // A KASIR without one cannot record a sale — `BranchScopeGuard` would reject
  // every attempt — so this fails loudly here rather than at submit time.
  if (!user.branchId && user.role === 'KASIR') {
    return (
      <div
        role="alert"
        className="rounded-sm border border-status-danger/30 bg-status-danger/10 p-4 text-sm text-status-danger"
      >
        Akun Anda belum terhubung ke cabang mana pun, sehingga penjualan tidak
        dapat dicatat. Hubungi Owner untuk menetapkan cabang.
      </div>
    );
  }

  if (!user.branchId && user.role === 'OWNER') {
    return (
      <div
        role="alert"
        className="rounded-sm border border-status-warning/30 bg-status-warning/10 p-4 text-sm text-status-warning"
      >
        Akun Owner Anda belum terhubung ke cabang aktif. Silakan pilih cabang di
        pengaturan pengguna atau gunakan akun Kasir cabang untuk bertransaksi.
      </div>
    );
  }

  return <PosScreen branchId={user.branchId!} />;
}
