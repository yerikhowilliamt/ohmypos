import type { Metadata } from 'next';
import { requireRole } from '@/lib/session';
import { AttendanceClient } from './AttendanceClient';

export const metadata: Metadata = {
  title: 'Log Absensi — OhMyPos',
  description:
    'Pantau log absensi dan validasi perangkat login kasir per cabang',
};

export default async function Page() {
  await requireRole(['OWNER']);

  return (
    <main className="flex-1 p-6 max-w-5xl mx-auto w-full">
      <AttendanceClient />
    </main>
  );
}
