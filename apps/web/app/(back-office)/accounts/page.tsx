import type { Metadata } from 'next';
import { requireRole } from '@/lib/session';
import { AccountsClient } from './AccountsClient';

export const metadata: Metadata = {
  title: 'Metode Pembayaran — OhMyPos',
  description: 'Daftar rekening bank dan kas toko',
};

export default async function AccountsPage() {
  await requireRole(['OWNER', 'ADMIN']);

  return (
    <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
      <AccountsClient />
    </main>
  );
}
