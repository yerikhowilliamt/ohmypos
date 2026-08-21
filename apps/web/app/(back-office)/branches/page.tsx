import type { Metadata } from 'next';
import { requireRole } from '@/lib/session';
import { BranchesClient } from './BranchesClient';

export const metadata: Metadata = {
  title: 'Cabang — OhMyPos',
  description: 'Daftar cabang toko dan outlet aktif',
};

export default async function BranchesPage() {
  await requireRole(['OWNER']);

  return (
    <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
      <BranchesClient />
    </main>
  );
}
