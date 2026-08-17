import type { Metadata } from 'next';
import { requireRole } from '@/lib/session';

export const metadata: Metadata = {
  title: 'Rekonsiliasi — OhMyPos',
  description: 'Rekonsiliasi rekening bank dengan pencatatan pembukuan',
};

export default async function Page() {
  await requireRole(['ADMIN', 'OWNER']);

  return (
    <main className="flex-1 p-6">
      <h1 className="text-xl font-bold text-text-primary">Rekonsiliasi</h1>
      <p className="mt-2 text-sm text-text-secondary">
        Modul backend sudah siap sejak Phase 1; layarnya dibangun kemudian.
      </p>
    </main>
  );
}
