import type { Metadata } from 'next';
import { requireRole } from '@/lib/session';
import { ProfileClient } from './ProfileClient';

export const metadata: Metadata = {
  title: 'Profil Saya — OhMyPos',
  description: 'Perbarui informasi profil dan kata sandi akun Anda.',
};

export default async function Page() {
  await requireRole(['KASIR', 'ADMIN', 'OWNER']);

  return (
    <main className="flex-1 p-6 max-w-2xl mx-auto w-full">
      <ProfileClient />
    </main>
  );
}
