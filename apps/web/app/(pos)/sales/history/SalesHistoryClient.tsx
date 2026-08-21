'use client';

import * as React from 'react';
import type { UserResponse } from '@ohmypos/api-contracts';
import { useSales } from '@/hooks/usePos';
import { useBranches } from '@/hooks/useBranches';
import { SalesHistoryTable } from '@/components/pos/SalesHistoryTable';
import { Button } from '@ohmypos/ui/components/button';
import { DatePicker } from '@ohmypos/ui/components/date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ohmypos/ui/components/select';
import { Store } from 'lucide-react';

interface SalesHistoryClientProps {
  user: UserResponse;
}

export function SalesHistoryClient({ user }: SalesHistoryClientProps) {
  const [selectedBranchId, setSelectedBranchId] = React.useState<string>(
    user.role === 'KASIR' ? (user.branchId ?? 'all') : 'all',
  );
  const [startDate, setStartDate] = React.useState<string>('');
  const [endDate, setEndDate] = React.useState<string>('');

  const branches = useBranches();

  const queryParams = React.useMemo(() => {
    return {
      branchId:
        user.role === 'KASIR'
          ? (user.branchId ?? undefined)
          : selectedBranchId !== 'all'
            ? selectedBranchId
            : undefined,
      startDate: startDate
        ? new Date(`${startDate}T00:00:00`).toISOString()
        : undefined,
      endDate: endDate
        ? new Date(`${endDate}T23:59:59.999`).toISOString()
        : undefined,
      limit: 100,
      sortBy: 'soldAt' as const,
      sortOrder: 'desc' as const,
    };
  }, [user, selectedBranchId, startDate, endDate]);

  const { data: salesData, isLoading: isSalesLoading } = useSales(queryParams);

  const salesList = React.useMemo(
    () => salesData?.data ?? [],
    [salesData?.data],
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Riwayat Transaksi Penjualan
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Daftar seluruh transaksi yang masuk, rincian pesanan, dan cetak ulang
          struk/invoice.
        </p>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-border-default bg-surface-raised p-3 w-full">
        {user.role === 'OWNER' && (
          <div className="flex items-center gap-2 min-w-50">
            <Store className="size-4 text-text-tertiary" />
            <Select
              value={selectedBranchId}
              onValueChange={setSelectedBranchId}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pilih Cabang" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Cabang</SelectItem>
                {(branches.data ?? []).map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex items-center gap-2 w-full">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 text-xs text-text-secondary w-full">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 w-full sm:w-auto">
              <span>Dari:</span>
              <DatePicker
                value={startDate}
                onChange={(date) => setStartDate(date ?? '')}
                placeholder="Mulai"
                className="h-6 text-xs w-full sm:w-40"
              />
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 w-full sm:w-auto">
              <span>Sampai:</span>
              <DatePicker
                value={endDate}
                onChange={(date) => setEndDate(date ?? '')}
                placeholder="Selesai"
                className="h-6 text-xs w-full sm:w-40"
              />
            </div>
          </div>
        </div>

        {(startDate ||
          endDate ||
          (user.role === 'OWNER' && selectedBranchId !== 'all')) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setStartDate('');
              setEndDate('');
              if (user.role === 'OWNER') setSelectedBranchId('all');
            }}
            className="text-xs font-medium text-brand-primary hover:underline ml-auto h-8 px-2"
          >
            Reset Filter
          </Button>
        )}
      </div>

      {/* Transactions Table */}
      <SalesHistoryTable sales={salesList} isLoading={isSalesLoading} />
    </div>
  );
}
