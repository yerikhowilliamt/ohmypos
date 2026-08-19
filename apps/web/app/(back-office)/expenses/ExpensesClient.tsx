'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { GeneralExpenseTab } from '@/components/expenses/GeneralExpenseTab';
import { PurchaseEntryTab } from '@/components/expenses/PurchaseEntryTab';
import { PayablesTab } from '@/components/expenses/PayablesTab';

interface ExpensesClientProps {
  initialTab?: 'general' | 'purchases' | 'payables';
}

const TAB_TITLES = {
  general: {
    title: 'Pengeluaran Umum',
    desc: 'Catat pengeluaran operasional dan biaya umum bisnis.',
  },
  purchases: {
    title: 'Pembelian Bahan Baku',
    desc: 'Catat pembelian bahan baku dari pemasok serta status pembayarannya.',
  },
  payables: {
    title: 'Pelunasan Utang',
    desc: 'Kelola daftar utang belum lunas dan catat pelunasan ke pemasok.',
  },
};

export function ExpensesClient({
  initialTab = 'general',
}: ExpensesClientProps) {
  const pathname = usePathname();
  const router = useRouter();

  const currentTab = React.useMemo<'general' | 'purchases' | 'payables'>(() => {
    if (pathname.includes('/purchases')) return 'purchases';
    if (pathname.includes('/payables')) return 'payables';
    if (pathname === '/expenses') return 'general';
    return initialTab;
  }, [pathname, initialTab]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          {TAB_TITLES[currentTab].title}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          {TAB_TITLES[currentTab].desc}
        </p>
      </div>

      {currentTab === 'general' && <GeneralExpenseTab />}
      {currentTab === 'purchases' && (
        <PurchaseEntryTab
          onGoToPayables={() => router.push('/expenses/payables')}
        />
      )}
      {currentTab === 'payables' && <PayablesTab />}
    </div>
  );
}
