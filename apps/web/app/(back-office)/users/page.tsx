import type { Metadata } from 'next';
import { requireRole } from '@/lib/session';
import { UsersClient } from './UsersClient';

export const metadata: Metadata = {
  title: 'Pengguna — OhMyPos',
  description: 'Kelola akun staf dan peran akses',
};

export default async function Page() {
  await requireRole(['OWNER']);

  return (
    <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
      <UsersClient />
    </main>
  );
}
