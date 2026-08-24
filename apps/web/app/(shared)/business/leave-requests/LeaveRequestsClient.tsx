'use client';

import type { UserRole } from '@ohmypos/api-contracts';
import { MyLeaveRequests } from './MyLeaveRequests';
import { OwnerReviewQueue } from './OwnerReviewQueue';

export function LeaveRequestsClient({ role }: { role: UserRole }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Cuti
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          {role === 'OWNER'
            ? 'Tinjau dan setujui atau tolak pengajuan cuti karyawan.'
            : 'Ajukan cuti dan lihat status pengajuan Anda.'}
        </p>
      </div>

      {role === 'OWNER' ? <OwnerReviewQueue /> : <MyLeaveRequests />}
    </div>
  );
}
