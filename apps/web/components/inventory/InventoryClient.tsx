'use client';

import * as React from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import {
  useInventorySummary,
  useOpeningStockWorksheet,
  useUpsertOpeningStock,
} from '@/hooks/useInventory';
import { PeriodNavigator } from './PeriodNavigator';
import { OpeningStockWorksheetTable } from './OpeningStockWorksheetTable';
import { InventorySummaryTable } from './InventorySummaryTable';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@ohmypos/ui/components/tabs';
import type { UpsertOpeningStock } from '@ohmypos/api-contracts';
import { AlertCircle, CheckCircle2, Boxes } from 'lucide-react';
import { Skeleton } from '@ohmypos/ui/components/skeleton';

function getCurrentMonthString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function InventoryClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Selected period from URL query param or fallback to current month
  const rawPeriod = searchParams.get('period');
  const period = React.useMemo(() => {
    if (rawPeriod && /^\d{4}-(0[1-9]|1[0-2])$/.test(rawPeriod)) {
      return rawPeriod;
    }
    return getCurrentMonthString();
  }, [rawPeriod]);

  const [notification, setNotification] = React.useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Sync period changes to URL search parameters
  const handlePeriodChange = (newPeriod: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('period', newPeriod);
    router.push(`${pathname}?${params.toString()}`);
    setNotification(null);
  };

  const {
    data: worksheet,
    isLoading: isWorksheetLoading,
    isError: isWorksheetError,
    error: worksheetError,
  } = useOpeningStockWorksheet(period);

  const {
    data: summary,
    isLoading: isSummaryLoading,
    isError: isSummaryError,
    error: summaryError,
  } = useInventorySummary(period);

  const upsertMutation = useUpsertOpeningStock();

  const handleSubmit = async (formData: UpsertOpeningStock) => {
    setNotification(null);
    try {
      await upsertMutation.mutateAsync(formData);
      setNotification({
        type: 'success',
        message: `Stok awal untuk periode ${period} berhasil disimpan.`,
      });
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Terjadi kesalahan saat menyimpan stok awal.';
      setNotification({
        type: 'error',
        message: errorMessage,
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header section with title and period navigator */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="w-full lg:w-3/5">
          <div className="flex items-center gap-2">
            <Boxes className="size-6 text-brand-primary" />
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">
              Stok Bahan Baku
            </h1>
          </div>
          <p className="mt-1 text-sm text-text-secondary">
            Pantau stok bahan baku dan catat stok awal di awal periode
            operasional. Rincian stok awal, penambahan dari belanja, pemakaian
            dari penjualan, dan stok akhir.
          </p>
        </div>

        <div className="shrink-0">
          <PeriodNavigator
            period={period}
            onPeriodChange={handlePeriodChange}
            disabled={
              isWorksheetLoading || isSummaryLoading || upsertMutation.isPending
            }
          />
        </div>
      </div>

      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">Ringkasan Pergerakan Stok</TabsTrigger>
          <TabsTrigger value="opening">Stok Awal</TabsTrigger>
        </TabsList>

        <TabsContent value="summary">
          {isSummaryLoading ? (
            <SummaryLoading />
          ) : isSummaryError ? (
            <DataError
              title="Gagal memuat ringkasan stok"
              error={summaryError}
            />
          ) : (
            <InventorySummaryTable rows={summary?.data ?? []} period={period} />
          )}
        </TabsContent>

        <TabsContent value="opening">
          {/* Status Notifications */}
          {notification && (
            <div
              role="alert"
              className={`p-4 rounded-md border flex items-center gap-3 text-sm ${
                notification.type === 'success'
                  ? 'bg-status-success/10 border-status-success/30 text-status-success'
                  : 'bg-status-danger/10 border-status-danger/30 text-status-danger'
              }`}
            >
              {notification.type === 'success' ? (
                <CheckCircle2 className="size-5 shrink-0" />
              ) : (
                <AlertCircle className="size-5 shrink-0" />
              )}
              <span>{notification.message}</span>
            </div>
          )}

          {/* Main Content Areas: Loading, Error, or Worksheet Table */}
          {isWorksheetLoading ? (
            <TableSkeleton />
          ) : isWorksheetError ? (
            <div className="p-8 text-center rounded-md border border-status-danger/30 bg-status-danger/5 text-status-danger">
              <AlertCircle className="size-8 mx-auto mb-2 opacity-80" />
              <h3 className="font-semibold text-base">
                Gagal memuat data stok awal
              </h3>
              <p className="text-sm mt-1">
                {worksheetError instanceof Error
                  ? worksheetError.message
                  : 'Terjadi kesalahan pada server.'}
              </p>
            </div>
          ) : (
            <OpeningStockWorksheetTable
              periodMonth={period}
              rows={worksheet?.data ?? []}
              onSubmit={handleSubmit}
              isSubmitting={upsertMutation.isPending}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** Mirrors DashboardClient's list-skeleton pattern, sized for a table. */
function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="rounded-md border border-border-default bg-surface-raised p-4">
      <div className="space-y-2">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    </div>
  );
}

function SummaryLoading() {
  return <TableSkeleton />;
}

function DataError({ title, error }: { title: string; error: unknown }) {
  return (
    <div className="p-8 text-center rounded-md border border-status-danger/30 bg-status-danger/5 text-status-danger">
      <AlertCircle className="size-8 mx-auto mb-2 opacity-80" />
      <h3 className="font-semibold text-base">{title}</h3>
      <p className="text-sm mt-1">
        {error instanceof Error
          ? error.message
          : 'Terjadi kesalahan pada server.'}
      </p>
    </div>
  );
}
