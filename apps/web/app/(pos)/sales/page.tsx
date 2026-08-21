import { redirect } from 'next/navigation';
import { PosScreen } from '@/components/pos/PosScreen';
import { getSession } from '@/lib/session';

/**
 * POS / Sales Entry (PRD §5.2, DESIGN.md §20).
 * Accessible by KASIR and OWNER. For KASIR, user.branchId is required — it is
 * their only branch. OWNER has no fixed branch (ADR-011: unscoped, all-branch
 * access); PosScreen renders a branch picker for them instead.
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

  return <PosScreen branchId={user.branchId ?? null} role={user.role} />;
}
