import type { Metadata } from 'next';
import * as React from 'react';
import { requireRole } from '@/lib/session';
import { ReportsClient } from '@/components/reports/ReportsClient';

export const metadata: Metadata = {
  title: 'Pendapatan Harian — Laporan — OhMyPos',
  description: 'Tren omzet harian dan pergerakan tren penjualan',
};

export default async function ReportsDailyPage() {
  await requireRole(['OWNER']);

  return (
    <main className="flex-1 p-3.5 sm:p-6 max-w-7xl mx-auto w-full">
      <React.Suspense
        fallback={
          <div className="p-12 text-center rounded-md border border-border-default bg-surface-raised">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary mx-auto mb-3" />
            <p className="text-sm text-text-secondary">Memuat laporan...</p>
          </div>
        }
      >
        <ReportsClient forcedTab="daily-income" />
      </React.Suspense>
    </main>
  );
}
