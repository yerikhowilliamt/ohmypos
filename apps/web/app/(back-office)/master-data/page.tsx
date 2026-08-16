import type { Metadata } from 'next';
import { requireRole } from '@/lib/session';
import { MasterDataClient } from './MasterDataClient';

export const metadata: Metadata = {
  title: 'Data Master — OhMyPos',
  description: 'Kelola data produk, resep, dan bahan baku',
};

export default async function MasterDataPage() {
  await requireRole(['ADMIN', 'OWNER']);

  return (
    <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
      <MasterDataClient />
    </main>
  );
}
