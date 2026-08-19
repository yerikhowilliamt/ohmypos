import type { Metadata } from 'next';
import { requireRole } from '@/lib/session';
import { ExpensesClient } from './ExpensesClient';

export const metadata: Metadata = {
  title: 'Pengeluaran Umum — Pengeluaran — OhMyPos',
  description: 'Catat pengeluaran operasional dan umum bisnis',
};

export default async function ExpensesGeneralPage() {
  await requireRole(['OWNER']);

  return (
    <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
      <ExpensesClient initialTab="general" />
    </main>
  );
}
