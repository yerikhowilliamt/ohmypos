'use client';

import { useAccounts } from '@/hooks/useAccounts';
import { AccountsTable } from '@/components/accounts/AccountsTable';

export function AccountsClient() {
  const { data: accounts = [], isLoading } = useAccounts();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Rekening & Kas
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Kelola rekening bank dan kas kasir untuk penerimaan pembayaran
          transaksi toko.
        </p>
      </div>

      <AccountsTable accounts={accounts} isLoading={isLoading} />
    </div>
  );
}
