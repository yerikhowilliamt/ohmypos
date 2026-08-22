'use client';

import * as React from 'react';
import type { SaleSortBy, UserResponse } from '@ohmypos/api-contracts';
import type { OnChangeFn, SortingState } from '@tanstack/react-table';
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

const DEFAULT_PAGE_SIZE = 10;

/** Only these column ids exist as backend sort keys (`SaleSortBySchema`). */
const SORTABLE_COLUMN_IDS: SaleSortBy[] = [
  'soldAt',
  'totalAmount',
  'createdAt',
];

function toSaleSortBy(columnId: string | undefined): SaleSortBy {
  return SORTABLE_COLUMN_IDS.includes(columnId as SaleSortBy)
    ? (columnId as SaleSortBy)
    : 'soldAt';
}

interface SalesHistoryClientProps {
  user: UserResponse;
}

export function SalesHistoryClient({ user }: SalesHistoryClientProps) {
  const [selectedBranchId, setSelectedBranchId] = React.useState<string>(
    user.role === 'KASIR' ? (user.branchId ?? 'all') : 'all',
  );
  const [startDate, setStartDate] = React.useState<string>('');
  const [endDate, setEndDate] = React.useState<string>('');
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(DEFAULT_PAGE_SIZE);
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'soldAt', desc: true },
  ]);

  const branches = useBranches();

  // Any change to sort or filters invalidates the current page number — page 4
  // of the old ordering is not page 4 of the new one.
  const handleSortingChange: OnChangeFn<SortingState> = (updater) => {
    setSorting((current) =>
      typeof updater === 'function' ? updater(current) : updater,
    );
    setPage(1);
  };

  const queryParams = React.useMemo(() => {
    const activeSort = sorting[0];
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
      page,
      limit,
      sortBy: toSaleSortBy(activeSort?.id),
      sortOrder: (activeSort?.desc === false ? 'asc' : 'desc') as
        'asc' | 'desc',
    };
  }, [user, selectedBranchId, startDate, endDate, page, limit, sorting]);

  const { data: salesData, isLoading: isSalesLoading } = useSales(queryParams);

  const salesList = React.useMemo(
    () => salesData?.data ?? [],
    [salesData?.data],
  );

  const paginationMeta = salesData?.meta ?? {
    total: 0,
    page,
    limit,
    totalPages: 1,
  };

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
              onValueChange={(value) => {
                setSelectedBranchId(value);
                setPage(1);
              }}
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
                onChange={(date) => {
                  setStartDate(date ?? '');
                  setPage(1);
                }}
                placeholder="Mulai"
                className="h-6 text-xs w-full sm:w-40"
              />
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 w-full sm:w-auto">
              <span>Sampai:</span>
              <DatePicker
                value={endDate}
                onChange={(date) => {
                  setEndDate(date ?? '');
                  setPage(1);
                }}
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
              setPage(1);
            }}
            className="text-xs font-medium text-brand-primary hover:underline ml-auto h-8 px-2"
          >
            Reset Filter
          </Button>
        )}
      </div>

      {/* Transactions Table */}
      <SalesHistoryTable
        sales={salesList}
        isLoading={isSalesLoading}
        sorting={sorting}
        onSortingChange={handleSortingChange}
        pagination={{
          meta: paginationMeta,
          onPageChange: setPage,
          onLimitChange: (next) => {
            setLimit(next);
            setPage(1);
          },
          itemNoun: 'transaksi',
        }}
      />
    </div>
  );
}
