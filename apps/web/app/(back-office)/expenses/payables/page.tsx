import type { Metadata } from 'next';
import { requireRole } from '@/lib/session';
import { ExpensesClient } from '../ExpensesClient';

export const metadata: Metadata = {
  title: 'Utang — Pengeluaran — OhMyPos',
  description: 'Kelola dan catat pelunasan utang ke pemasok',
};

export default async function ExpensesPayablesPage() {
  await requireRole(['OWNER']);

  return (
    <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
      <ExpensesClient initialTab="payables" />
    </main>
  );
}
