import type { Metadata } from 'next';
import { requireRole } from '@/lib/session';
import { ExpenseCategoriesClient } from './ExpenseCategoriesClient';

export const metadata: Metadata = {
  title: 'Kategori Pengeluaran — Data Master — OhMyPos',
  description: 'Kelola kategori untuk pencatatan pengeluaran umum',
};

export default async function ExpenseCategoriesPage() {
  await requireRole(['ADMIN', 'OWNER']);

  return (
    <main className="mx-auto flex-1 w-full max-w-7xl p-6">
      <ExpenseCategoriesClient />
    </main>
  );
}
