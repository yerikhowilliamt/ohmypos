import type { Metadata } from 'next';
import { requireRole } from '@/lib/session';
import { BusinessProfileClient } from './BusinessProfileClient';

export const metadata: Metadata = {
  title: 'Profil Bisnis — OhMyPos',
  description: 'Kelola nama, logo, dan alamat bisnis Anda',
};

export default async function Page() {
  await requireRole(['OWNER']);

  return (
    <main className="flex-1 p-6 max-w-4xl mx-auto w-full">
      <BusinessProfileClient />
    </main>
  );
}
