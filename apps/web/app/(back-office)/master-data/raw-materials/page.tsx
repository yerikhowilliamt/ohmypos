import type { Metadata } from 'next';
import { requireRole } from '@/lib/session';
import { MasterDataClient } from '../MasterDataClient';

export const metadata: Metadata = {
  title: 'Bahan Baku — Data Master — OhMyPos',
  description: 'Daftar bahan baku dan harga beli',
};

export default async function MasterDataRawMaterialsPage() {
  await requireRole(['ADMIN', 'OWNER']);

  return (
    <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
      <MasterDataClient initialTab="raw-materials" />
    </main>
  );
}
