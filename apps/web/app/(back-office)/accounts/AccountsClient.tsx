'use client';

import { useAccounts } from '@/hooks/useAccounts';
import { AccountsTable } from '@/components/accounts/AccountsTable';

export function AccountsClient() {
  const { data: accounts = [], isLoading } = useAccounts();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Metode Pembayaran (Kas & Bank)
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Kelola akun penampung dana pembayaran transaksi POS (Kas Tunai,
          E-Wallet, QRIS, Transfer Bank).
        </p>
      </div>

      <AccountsTable accounts={accounts} isLoading={isLoading} />
    </div>
  );
}
