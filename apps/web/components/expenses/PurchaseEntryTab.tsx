'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Button } from '@ohmypos/ui/components/button';
import { ArrowRight, Plus } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import {
  formatPaymentStatus,
  getPaymentStatusBadgeClasses,
} from '@/lib/vocabulary';
import { Badge } from '@ohmypos/ui/components/badge';
import { useSupplierPurchases } from '@/hooks/useExpenses';
import { DataTable, SortableHeader } from '@/components/ui/data-table';
import type { SupplierPurchaseResponse } from '@ohmypos/api-contracts';
import { PurchaseEntryFormDialog } from './PurchaseEntryFormDialog';
import { CentralBranchTag } from './CentralBranchTag';

interface PurchaseEntryTabProps {
  onGoToPayables: () => void;
}

const columns: ColumnDef<SupplierPurchaseResponse>[] = [
  {
    accessorFn: (row) => new Date(row.purchaseDate).getTime(),
    id: 'purchaseDate',
    header: ({ column }) => <SortableHeader label="Tanggal" column={column} />,
    cell: ({ row }) => (
      <span className="text-text-secondary">
        {new Date(row.original.purchaseDate).toLocaleDateString('id-ID')}
      </span>
    ),
  },
  {
    accessorKey: 'supplierName',
    header: ({ column }) => <SortableHeader label="Pemasok" column={column} />,
    cell: ({ row }) => (
      <span className="font-medium text-text-primary">
        {row.original.supplierName}
      </span>
    ),
  },
  {
    accessorFn: (row) => row.branchId ?? 'Central',
    id: 'branchId',
    header: ({ column }) => <SortableHeader label="Lokasi" column={column} />,
    cell: ({ row }) => <CentralBranchTag branchId={row.original.branchId} />,
  },
  {
    accessorKey: 'paymentStatus',
    filterFn: 'equalsString',
    header: ({ column }) => <SortableHeader label="Status" column={column} />,
    cell: ({ row }) => (
      <Badge
        className={`text-[11px] ${getPaymentStatusBadgeClasses(row.original.paymentStatus)}`}
      >
        {formatPaymentStatus(row.original.paymentStatus)}
      </Badge>
    ),
    meta: { align: 'center' },
  },
  {
    accessorFn: (row) => Number(row.totalAmount),
    id: 'totalAmount',
    header: ({ column }) => (
      <SortableHeader label="Total" column={column} align="right" />
    ),
    cell: ({ row }) => (
      <span className="numeric font-mono font-medium text-accent-outflow">
        {formatCurrency(row.original.totalAmount)}
      </span>
    ),
    meta: { align: 'right' },
  },
];

export function PurchaseEntryTab({ onGoToPayables }: PurchaseEntryTabProps) {
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [unpaidBanner, setUnpaidBanner] = React.useState<string | null>(null);
  const { data, isLoading } = useSupplierPurchases();
  const purchases = data?.data ?? [];

  const handleUnpaidPurchaseCreated = (supplierName: string) => {
    setUnpaidBanner(supplierName);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">
            Pembelian Bahan Baku
          </h2>
          <p className="text-xs text-text-secondary">
            Stok bertambah segera; pengeluaran hanya tercatat jika dibayar
            langsung (ADR-006).
          </p>
        </div>
        <Button
          onClick={() => setIsCreateOpen(true)}
          className="gap-2 shrink-0 w-full md:w-auto"
        >
          <Plus className="size-4" />
          Catat Pembelian
        </Button>
      </div>

      {unpaidBanner && (
        <div className="flex items-center justify-between gap-3 rounded-sm border border-status-warning/30 bg-status-warning/10 p-3 text-sm text-status-warning">
          <span>
            Pembelian dari <strong>{unpaidBanner}</strong> tercatat sebagai
            utang (belum dibayar).
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 shrink-0"
            onClick={() => {
              setUnpaidBanner(null);
              onGoToPayables();
            }}
          >
            Lihat di Utang
            <ArrowRight className="size-3.5" />
          </Button>
        </div>
      )}

      <DataTable
        columns={columns}
        data={purchases}
        isLoading={isLoading}
        emptyMessage="Belum ada pembelian tercatat."
      />

      <PurchaseEntryFormDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onUnpaidPurchaseCreated={handleUnpaidPurchaseCreated}
      />
    </div>
  );
}
