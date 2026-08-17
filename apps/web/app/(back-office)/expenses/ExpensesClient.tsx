'use client';

import * as React from 'react';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@ohmypos/ui/components/tabs';
import { GeneralExpenseTab } from '@/components/expenses/GeneralExpenseTab';
import { PurchaseEntryTab } from '@/components/expenses/PurchaseEntryTab';
import { PayablesTab } from '@/components/expenses/PayablesTab';
import { Receipt, ShoppingBasket, Wallet } from 'lucide-react';

export function ExpensesClient() {
  const [activeTab, setActiveTab] = React.useState('general');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Pengeluaran
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Catat pengeluaran umum, pembelian bahan baku dari pemasok, dan kelola
          pelunasan utang.
        </p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="w-full space-y-4"
      >
        <TabsList className="grid w-full max-w-xl grid-cols-3">
          <TabsTrigger
            value="general"
            className="gap-1.5 sm:gap-2 text-xs sm:text-sm truncate"
          >
            <Receipt className="size-3.5 sm:size-4 shrink-0" />
            <span className="truncate">Pengeluaran Umum</span>
          </TabsTrigger>
          <TabsTrigger
            value="purchases"
            className="gap-1.5 sm:gap-2 text-xs sm:text-sm truncate"
          >
            <ShoppingBasket className="size-3.5 sm:size-4 shrink-0" />
            <span className="truncate">Pembelian</span>
          </TabsTrigger>
          <TabsTrigger
            value="payables"
            className="gap-1.5 sm:gap-2 text-xs sm:text-sm truncate"
          >
            <Wallet className="size-3.5 sm:size-4 shrink-0" />
            <span className="truncate">Utang</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-0">
          <GeneralExpenseTab />
        </TabsContent>

        <TabsContent value="purchases" className="mt-0">
          <PurchaseEntryTab onGoToPayables={() => setActiveTab('payables')} />
        </TabsContent>

        <TabsContent value="payables" className="mt-0">
          <PayablesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
