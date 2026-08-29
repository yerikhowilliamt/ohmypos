'use client';

import { useBranches } from '@/hooks/useBranches';
import { BranchesTable } from '@/components/branches/BranchesTable';

export function BranchesClient() {
  const { data: allBranches = [], isLoading } = useBranches();
  // The system location (ADR-014) is a ledger scope, not a store: it has no POS
  // screen and no staff. Listing it on a page titled "Cabang Toko" is what made
  // it look like a flagship store that mysteriously could not sell anything.
  const branches = allBranches.filter((branch) => !branch.isSystem);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Cabang Toko
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Kelola daftar toko untuk penugasan kasir dan pemisahan laporan
          penjualan. Toko pertama otomatis menjadi Toko Utama.
        </p>
      </div>

      <BranchesTable branches={branches} isLoading={isLoading} />
    </div>
  );
}
