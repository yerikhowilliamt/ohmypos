import type { Metadata } from 'next';
import { requireRole } from '@/lib/session';
import { ExpensesClient } from '../ExpensesClient';

export const metadata: Metadata = {
  title: 'Utang — Pengeluaran — OhMyPos',
  description: 'Pantau tagihan dan catat pembayaran utang pemasok',
};

export default async function ExpensesPayablesPage() {
  await requireRole(['OWNER']);

  return (
    <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
      <ExpensesClient initialTab="payables" />
    </main>
  );
}
