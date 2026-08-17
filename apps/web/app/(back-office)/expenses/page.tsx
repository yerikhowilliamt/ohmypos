import type { Metadata } from 'next';
import { requireRole } from '@/lib/session';
import { ExpensesClient } from './ExpensesClient';

export const metadata: Metadata = {
  title: 'Pengeluaran — OhMyPos',
  description:
    'Catat pengeluaran umum, pembelian bahan baku, dan pelunasan utang',
};

export default async function ExpensesPage() {
  await requireRole(['OWNER']);

  return (
    <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
      <ExpensesClient />
    </main>
  );
}
