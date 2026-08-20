import type { Metadata } from 'next';
import { requireRole } from '@/lib/session';
import { ReconciliationClient } from './ReconciliationClient';

export const metadata: Metadata = {
  title: 'Rekonsiliasi — OhMyPos',
  description: 'Pencocokan mutasi rekening bank dengan catatan transaksi toko',
};

export default async function Page() {
  // ADMIN and OWNER only (ADR-011 §6, System Design §5). This is the UX gate;
  // RoleGuard on the import/matching/allocation/reconciliation controllers is
  // the enforcement, and the screen handles a 403 from it gracefully.
  await requireRole(['ADMIN', 'OWNER']);

  return (
    <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
      <ReconciliationClient />
    </main>
  );
}
