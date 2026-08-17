import { redirect } from 'next/navigation';
import { PosScreen } from '@/components/pos/PosScreen';
import { getSession } from '@/lib/session';

/**
 * POS / Sales Entry (PRD §5.2, DESIGN.md §20). The only route a KASIR can reach —
 * `(pos)/layout.tsx` already gates the role; this page resolves the session again
 * only to read `branchId`, which `CreateSaleSchema` requires and which must come
 * from the server, never from client state.
 *
 * `AppShell` supplies the `<main>` wrapper and the sidebar, so this renders the
 * two remaining zones directly.
 */
export default async function SalesPage() {
  const user = await getSession();

  if (!user) {
    redirect('/login');
  }

  // ADR-011 §2: `branchId` is required when `role = KASIR` and null otherwise.
  // A KASIR without one cannot record a sale — `BranchScopeGuard` would reject
  // every attempt — so this fails loudly here rather than at submit time.
  if (!user.branchId) {
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

  return <PosScreen branchId={user.branchId} />;
}
