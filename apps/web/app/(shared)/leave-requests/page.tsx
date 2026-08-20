import type { Metadata } from 'next';
import { requireRole } from '@/lib/session';
import { LeaveRequestsClient } from './LeaveRequestsClient';

export const metadata: Metadata = {
  title: 'Cuti — OhMyPos',
  description: 'Ajukan cuti atau tinjau pengajuan cuti karyawan',
};

export default async function Page() {
  const user = await requireRole(['KASIR', 'ADMIN', 'OWNER']);

  return (
    <main className="flex-1 p-6 max-w-3xl mx-auto w-full">
      <LeaveRequestsClient role={user.role} />
    </main>
  );
}
