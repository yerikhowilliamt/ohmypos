import type { Metadata } from 'next';
import { requireRole } from '@/lib/session';
import { ExpensesClient } from '../ExpensesClient';

export const metadata: Metadata = {
  title: 'Pembelian — Pengeluaran — OhMyPos',
  description: 'Catat pembelian bahan baku dari pemasok',
};

export default async function ExpensesPurchasesPage() {
  await requireRole(['OWNER']);

  return (
    <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
      <ExpensesClient initialTab="purchases" />
    </main>
  );
}
