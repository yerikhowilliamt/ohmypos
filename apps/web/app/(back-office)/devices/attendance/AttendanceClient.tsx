'use client';

import * as React from 'react';
import { useBranches } from '@/hooks/useBranches';
import { AttendanceLogTable } from '../AttendanceLogTable';

export function AttendanceClient() {
  const { data: branches = [] } = useBranches();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Log Absensi Kasir
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Pantau riwayat waktu login kasir dan validasi terminal resmi toko per
          cabang.
        </p>
      </div>

      <AttendanceLogTable branches={branches} />
    </div>
  );
}
