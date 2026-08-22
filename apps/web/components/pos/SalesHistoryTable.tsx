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
import { ReceiptText } from 'lucide-react';
import { SaleReceiptDialog } from './SaleReceiptDialog';

interface SalesHistoryTableProps {
  sales: SaleResponse[];
  isLoading?: boolean;
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
  pagination: DataTablePagination;
  /**
   * Raw (un-debounced) search text and its setter. Both live in
   * SalesHistoryClient, next to the page/filter state the query is built from —
   * the fetch happens there, not here.
   */
  search: string;
  onSearchChange: (value: string) => void;
}

export function SalesHistoryTable({
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

  const handleOpenReceipt = (sale: SaleResponse) => {
    setSelectedSale(sale);
    setReceiptOpen(true);
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
        cell: ({ row }) => (
          <span className="font-mono text-xs font-semibold text-text-secondary">
            #{row.original.id.slice(0, 8).toUpperCase()}
          </span>
        ),
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
        cell: ({ row }) => (
          <span className="numeric font-mono text-xs font-bold text-accent-inflow">
            {formatCurrency(row.original.totalAmount)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        meta: { align: 'right' },
        cell: ({ row }) => (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleOpenReceipt(row.original)}
            className="h-8 gap-1 text-xs"
          >
            <ReceiptText className="size-3.5" />
            <span>Struk</span>
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <>
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
    </>
  );
}
