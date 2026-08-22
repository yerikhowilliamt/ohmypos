import type { Metadata } from 'next';
import * as React from 'react';
import { requireRole } from '@/lib/session';
import { StockMovementsClient } from '@/components/inventory/StockMovementsClient';

export const metadata: Metadata = {
  title: 'Riwayat Pergerakan Stok — OhMyPos',
  description: 'Catatan setiap pergerakan stok bahan baku',
};

export default async function StockMovementsPage() {
  // Mirrors @Roles('OWNER') on StockMovementsController. This is defence in
  // depth for the route, never the enforcement — that lives in RoleGuard
  // (ADR-011, Playbook §8).
  await requireRole(['OWNER']);

  return (
    <main className="flex-1 p-3.5 sm:p-6 max-w-7xl mx-auto w-full">
      <React.Suspense
        fallback={
          <div className="p-12 text-center rounded-md border border-border-default bg-surface-raised">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary mx-auto mb-3" />
            <p className="text-sm text-text-secondary">
              Memuat riwayat pergerakan stok...
            </p>
          </div>
        }
      >
        <StockMovementsClient />
      </React.Suspense>
    </main>
  );
}
