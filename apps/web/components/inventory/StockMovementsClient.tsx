'use client';

import * as React from 'react';
import type {
  StockDirection,
  StockMovementSortBy,
  StockReferenceType,
} from '@ohmypos/api-contracts';
import type { OnChangeFn, SortingState } from '@tanstack/react-table';
import { useStockMovements } from '@/hooks/useInventory';
import { useRawMaterials } from '@/hooks/useMasterData';
import { useBranches } from '@/hooks/useBranches';
import { StockMovementsTable } from './StockMovementsTable';
import { Button } from '@ohmypos/ui/components/button';
import { DatePicker } from '@ohmypos/ui/components/date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ohmypos/ui/components/select';
import { History } from 'lucide-react';

const DEFAULT_PAGE_SIZE = 10;

const ALL = 'all';

/** Only these column ids exist as backend sort keys (`StockMovementSortBySchema`). */
const SORTABLE_COLUMN_IDS: StockMovementSortBy[] = [
  'movementDate',
  'quantity',
  'unitCostAtMovement',
  'rawMaterialName',
  'createdAt',
];

function toStockMovementSortBy(
  columnId: string | undefined,
): StockMovementSortBy {
  return SORTABLE_COLUMN_IDS.includes(columnId as StockMovementSortBy)
    ? (columnId as StockMovementSortBy)
    : 'movementDate';
}

const DIRECTION_LABEL: Record<StockDirection, string> = {
  IN: 'Masuk',
  OUT: 'Keluar',
};

const REFERENCE_TYPE_LABEL: Record<StockReferenceType, string> = {
  SALE: 'Penjualan',
  PURCHASE: 'Pembelian',
  OPENING: 'Stok Awal',
  ADJUSTMENT: 'Penyesuaian',
};

export function StockMovementsClient() {
  const [rawMaterialId, setRawMaterialId] = React.useState<string>(ALL);
  const [branchId, setBranchId] = React.useState<string>(ALL);
  const [direction, setDirection] = React.useState<string>(ALL);
  const [referenceType, setReferenceType] = React.useState<string>(ALL);
  const [startDate, setStartDate] = React.useState<string>('');
  const [endDate, setEndDate] = React.useState<string>('');
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(DEFAULT_PAGE_SIZE);
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'movementDate', desc: true },
  ]);

  const rawMaterials = useRawMaterials();
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
      rawMaterialId: rawMaterialId !== ALL ? rawMaterialId : undefined,
      branchId: branchId !== ALL ? branchId : undefined,
      direction: direction !== ALL ? (direction as StockDirection) : undefined,
      referenceType:
        referenceType !== ALL
          ? (referenceType as StockReferenceType)
          : undefined,
      startDate: startDate
        ? new Date(`${startDate}T00:00:00`).toISOString()
        : undefined,
      endDate: endDate
        ? new Date(`${endDate}T23:59:59.999`).toISOString()
        : undefined,
      page,
      limit,
      sortBy: toStockMovementSortBy(activeSort?.id),
      sortOrder: (activeSort?.desc === false ? 'asc' : 'desc') as
        'asc' | 'desc',
    };
  }, [
    rawMaterialId,
    branchId,
    direction,
    referenceType,
    startDate,
    endDate,
    page,
    limit,
    sorting,
  ]);

  const { data, isLoading } = useStockMovements(queryParams);

  const movements = React.useMemo(() => data?.data ?? [], [data?.data]);

  const paginationMeta = data?.meta ?? {
    total: 0,
    page,
    limit,
    totalPages: 1,
  };

  const hasActiveFilter =
    rawMaterialId !== ALL ||
    branchId !== ALL ||
    direction !== ALL ||
    referenceType !== ALL ||
    Boolean(startDate) ||
    Boolean(endDate);

  const resetFilters = () => {
    setRawMaterialId(ALL);
    setBranchId(ALL);
    setDirection(ALL);
    setReferenceType(ALL);
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-2">
        <History className="size-6 text-brand-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            Riwayat Pergerakan Stok
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Catatan setiap pergerakan bahan baku — bukti baris per baris di
            balik angka ringkasan stok.
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-border-default bg-surface-raised p-3 w-full">
        <Select
          value={rawMaterialId}
          onValueChange={(value) => {
            setRawMaterialId(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-56" aria-label="Bahan baku">
            <SelectValue placeholder="Semua Bahan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Semua Bahan</SelectItem>
            {(rawMaterials.data ?? []).map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={branchId}
          onValueChange={(value) => {
            setBranchId(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-44" aria-label="Cabang">
            <SelectValue placeholder="Semua Cabang" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Semua Cabang</SelectItem>
            {(branches.data ?? []).map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={direction}
          onValueChange={(value) => {
            setDirection(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-36" aria-label="Arah">
            <SelectValue placeholder="Semua Arah" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Semua Arah</SelectItem>
            {(Object.keys(DIRECTION_LABEL) as StockDirection[]).map((d) => (
              <SelectItem key={d} value={d}>
                {DIRECTION_LABEL[d]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={referenceType}
          onValueChange={(value) => {
            setReferenceType(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-40" aria-label="Sumber">
            <SelectValue placeholder="Semua Sumber" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Semua Sumber</SelectItem>
            {(Object.keys(REFERENCE_TYPE_LABEL) as StockReferenceType[]).map(
              (t) => (
                <SelectItem key={t} value={t}>
                  {REFERENCE_TYPE_LABEL[t]}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>

        <div className="flex flex-col sm:flex-row sm:items-center gap-4 text-xs text-text-secondary">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1">
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
          <div className="flex flex-col sm:flex-row sm:items-center gap-1">
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

        {hasActiveFilter && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={resetFilters}
            className="text-xs font-medium text-brand-primary hover:underline ml-auto h-8 px-2"
          >
            Reset Filter
          </Button>
        )}
      </div>

      <StockMovementsTable
        movements={movements}
        isLoading={isLoading}
        sorting={sorting}
        onSortingChange={handleSortingChange}
        pagination={{
          meta: paginationMeta,
          onPageChange: setPage,
          onLimitChange: (next) => {
            setLimit(next);
            setPage(1);
          },
          itemNoun: 'pergerakan',
        }}
      />
    </div>
  );
}
