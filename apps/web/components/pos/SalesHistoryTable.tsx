'use client';

import * as React from 'react';
import type { SaleResponse } from '@ohmypos/api-contracts';
import type {
  ColumnDef,
  OnChangeFn,
  SortingState,
} from '@tanstack/react-table';
import {
  DataTable,
  SortableHeader,
  type DataTablePagination,
} from '@/components/ui/data-table';
import { Button } from '@ohmypos/ui/components/button';
import { formatCurrency, formatQuantity } from '@/lib/formatters';
import { AlertCircle, CheckCircle2, ReceiptText, Trash2 } from 'lucide-react';
import { SaleReceiptDialog } from './SaleReceiptDialog';
import { useVoidSale } from '@/hooks/usePos';
import { ApiError } from '@/lib/api';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@ohmypos/ui/components/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ohmypos/ui/components/dialog';

interface SalesHistoryTableProps {
  userRole?: string;
  sales: SaleResponse[];
  isLoading?: boolean;
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
  pagination: DataTablePagination;
  search: string;
  onSearchChange: (value: string) => void;
}

export function SalesHistoryTable({
  userRole,
  sales,
  isLoading = false,
  sorting,
  onSortingChange,
  pagination,
  search,
  onSearchChange,
}: SalesHistoryTableProps) {
  const [selectedSale, setSelectedSale] = React.useState<SaleResponse | null>(
    null,
  );
  const [receiptOpen, setReceiptOpen] = React.useState(false);
  const [voidOpen, setVoidOpen] = React.useState(false);
  const [saleToVoid, setSaleToVoid] = React.useState<SaleResponse | null>(null);
  const [voidFeedback, setVoidFeedback] = React.useState<{
    kind: 'success' | 'error';
    message: string;
  } | null>(null);

  const voidSale = useVoidSale();

  const handleOpenReceipt = (sale: SaleResponse) => {
    setSelectedSale(sale);
    setReceiptOpen(true);
  };

  const handleOpenVoid = (sale: SaleResponse) => {
    setSaleToVoid(sale);
    setVoidOpen(true);
  };

  const handleConfirmVoid = () => {
    if (!saleToVoid) return;
    voidSale.mutate(saleToVoid.id, {
      onSuccess: () => {
        setVoidFeedback({
          kind: 'success',
          message: 'Penjualan berhasil dibatalkan dan stok dikembalikan.',
        });
        setVoidOpen(false);
        setSaleToVoid(null);
      },
      onError: (error: unknown) => {
        setVoidFeedback({
          kind: 'error',
          message:
            error instanceof ApiError || error instanceof Error
              ? error.message
              : 'Terjadi kesalahan sistem.',
        });
        setVoidOpen(false);
      },
    });
  };

  const columns = React.useMemo<ColumnDef<SaleResponse>[]>(
    () => [
      {
        accessorKey: 'soldAt',
        header: ({ column }) => (
          <SortableHeader label="Waktu" column={column} />
        ),
        cell: ({ row }) => {
          const d = new Date(row.original.soldAt);
          return (
            <div className="flex flex-col">
              <span className="font-medium text-text-primary text-xs">
                {d.toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
              <span className="text-[11px] text-text-tertiary font-mono">
                {d.toLocaleTimeString('id-ID', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: 'id',
        header: 'No. Order',
        cell: ({ row }) => {
          const isVoided = row.original.status === 'VOIDED';
          return (
            <div className="flex flex-col gap-1">
              <span
                className={`font-mono text-xs font-semibold ${isVoided ? 'text-text-tertiary line-through' : 'text-text-secondary'}`}
              >
                #{row.original.id.slice(0, 8).toUpperCase()}
              </span>
              {isVoided && (
                <span className="inline-flex items-center rounded-sm bg-status-error/10 px-1.5 py-0.5 text-[10px] font-medium text-status-error w-fit">
                  Dibatalkan
                </span>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: 'branchName',
        header: 'Cabang',
        cell: ({ row }) => (
          <span className="text-xs text-text-primary">
            {row.original.branchName}
          </span>
        ),
      },
      {
        accessorKey: 'cashierName',
        header: 'Kasir',
        cell: ({ row }) => (
          <span className="text-xs text-text-secondary">
            {row.original.cashierName}
          </span>
        ),
      },
      {
        accessorKey: 'accountName',
        header: 'Metode Bayar',
        cell: ({ row }) => (
          <span className="inline-flex items-center rounded-sm bg-surface-muted px-2 py-0.5 text-xs font-medium text-text-secondary">
            {row.original.accountName}
          </span>
        ),
      },
      {
        id: 'totalItems',
        header: 'Total Item',
        meta: { align: 'center' },
        cell: ({ row }) => {
          const totalQty = row.original.items.reduce(
            (sum, item) => sum + Number(item.quantity),
            0,
          );
          return (
            <span className="text-xs text-text-secondary">
              {formatQuantity(totalQty)} item
            </span>
          );
        },
      },
      {
        accessorKey: 'totalAmount',
        header: ({ column }) => (
          <SortableHeader label="Total" column={column} align="right" />
        ),
        meta: { align: 'right' },
        cell: ({ row }) => {
          const isVoided = row.original.status === 'VOIDED';
          return (
            <span
              className={`numeric font-mono text-xs font-bold ${isVoided ? 'text-text-tertiary line-through' : 'text-accent-inflow'}`}
            >
              {formatCurrency(row.original.totalAmount)}
            </span>
          );
        },
      },
      {
        id: 'actions',
        header: '',
        meta: { align: 'right' },
        cell: ({ row }) => {
          const sale = row.original;
          const isVoided = sale.status === 'VOIDED';
          const isAdminOrOwner = userRole === 'ADMIN' || userRole === 'OWNER';
          const saleTime = new Date(sale.soldAt).getTime();
          const now = Date.now();
          const thirtyMinutesInMs = 30 * 60 * 1000;
          const isPast30Mins = now - saleTime > thirtyMinutesInMs;
          const canVoid = isAdminOrOwner && !isVoided;

          return (
            <div className="flex items-center justify-end gap-2">
              {canVoid && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenVoid(sale)}
                  disabled={isPast30Mins}
                  title={
                    isPast30Mins ? 'Sudah lewat 30 menit' : 'Batalkan Penjualan'
                  }
                  className="h-8 gap-1 text-xs text-status-error hover:text-status-error hover:bg-status-error/10 border-status-error/20"
                >
                  <Trash2 className="size-3.5" />
                  <span>Batalkan</span>
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleOpenReceipt(sale)}
                className="h-8 gap-1 text-xs"
              >
                <ReceiptText className="size-3.5" />
                <span>Struk</span>
              </Button>
            </div>
          );
        },
      },
    ],
    [userRole],
  );

  return (
    <>
      {voidFeedback && (
        <Alert
          variant={voidFeedback.kind === 'error' ? 'destructive' : 'default'}
        >
          {voidFeedback.kind === 'error' ? (
            <AlertCircle className="size-4" />
          ) : (
            <CheckCircle2 className="size-4" />
          )}
          <AlertTitle>
            {voidFeedback.kind === 'error'
              ? 'Gagal membatalkan'
              : 'Penjualan dibatalkan'}
          </AlertTitle>
          <AlertDescription>{voidFeedback.message}</AlertDescription>
        </Alert>
      )}
      <DataTable
        columns={columns}
        data={sales}
        isLoading={isLoading}
        sorting={sorting}
        onSortingChange={onSortingChange}
        pagination={pagination}
        serverSearch={{ value: search, onChange: onSearchChange }}
        searchPlaceholder="Cari id, cabang, kasir, atau akun..."
        searchLabel="Cari riwayat penjualan"
        emptyMessage="Belum ada data transaksi penjualan."
        emptyDescription="Transaksi yang dibuat kasir akan muncul di riwayat ini."
      />

      <SaleReceiptDialog
        sale={selectedSale}
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
      />

      <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Batalkan Penjualan</DialogTitle>
            <DialogDescription>
              Apakah Anda yakin ingin membatalkan transaksi ini? Tindakan ini{' '}
              <strong>tidak dapat diurungkan</strong>. Stok barang akan
              dikembalikan dan saldo akan dikurangi.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setVoidOpen(false)}
              disabled={voidSale.isPending}
            >
              Tutup
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmVoid}
              disabled={voidSale.isPending}
            >
              {voidSale.isPending ? 'Memproses...' : 'Ya, Batalkan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
