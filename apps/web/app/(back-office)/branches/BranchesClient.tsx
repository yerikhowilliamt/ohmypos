'use client';

import { useBranches } from '@/hooks/useBranches';
import { BranchesTable } from '@/components/branches/BranchesTable';

export function BranchesClient() {
  const { data: branches = [], isLoading } = useBranches();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Cabang
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Kelola daftar cabang tempat staf ditugaskan dan penjualan dicatat.
        </p>
      </div>

      <BranchesTable branches={branches} isLoading={isLoading} />
    </div>
  );
}
