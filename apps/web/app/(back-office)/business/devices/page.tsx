import type { Metadata } from 'next';
import { requireRole } from '@/lib/session';
import { DevicesClient } from './DevicesClient';

export const metadata: Metadata = {
  title: 'Perangkat — OhMyPos',
  description: 'Kelola perangkat yang terdaftar per cabang',
};

export default async function Page() {
  await requireRole(['OWNER']);

  return (
    <main className="flex-1 p-6 max-w-5xl mx-auto w-full">
      <DevicesClient />
    </main>
  );
}
