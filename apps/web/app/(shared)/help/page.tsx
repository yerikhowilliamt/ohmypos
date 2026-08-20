import type { Metadata } from 'next';
import { requireRole } from '@/lib/session';
import { HelpClient } from './HelpClient';

export const metadata: Metadata = {
  title: 'Bantuan — OhMyPos',
  description: 'Panduan langkah demi langkah menggunakan OhMyPos',
};

export default async function Page() {
  const user = await requireRole(['KASIR', 'ADMIN', 'OWNER']);

  return (
    <main className="flex-1 p-6 max-w-3xl mx-auto w-full">
      <HelpClient role={user.role} />
    </main>
  );
}
