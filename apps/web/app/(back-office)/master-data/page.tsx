import type { Metadata } from 'next';
import { requireRole } from '@/lib/session';
import { MasterDataClient } from './MasterDataClient';

export const metadata: Metadata = {
  title: 'Produk & Resep — Data Master — OhMyPos',
  description: 'Daftar menu produk dan resep bahan baku',
};

export default async function MasterDataProductsPage() {
  await requireRole(['ADMIN', 'OWNER']);

  return (
    <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
      <MasterDataClient initialTab="products" />
    </main>
  );
}
