'use client';

import * as React from 'react';
import { Button } from '@ohmypos/ui/components/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ohmypos/ui/components/table';
import { ArrowRight, Plus } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import {
  formatPaymentStatus,
  getPaymentStatusBadgeClasses,
} from '@/lib/vocabulary';
import { Badge } from '@ohmypos/ui/components/badge';
import { useSupplierPurchases } from '@/hooks/useExpenses';
import { PurchaseEntryFormDialog } from './PurchaseEntryFormDialog';
import { CentralBranchTag } from './CentralBranchTag';

interface PurchaseEntryTabProps {
  onGoToPayables: () => void;
}

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

      <div className="rounded-md border border-border-default bg-surface-raised shadow-1 overflow-hidden">
        <Table className="min-w-[650px]">
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[120px]">Tanggal</TableHead>
              <TableHead className="min-w-[200px]">Pemasok</TableHead>
              <TableHead className="min-w-[120px]">Lokasi</TableHead>
              <TableHead className="text-center min-w-[130px]">
                Status
              </TableHead>
              <TableHead className="text-right min-w-[130px]">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-32 text-center text-text-secondary"
                >
                  Memuat data pembelian…
                </TableCell>
              </TableRow>
            ) : purchases.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-32 text-center text-text-secondary"
                >
                  Belum ada pembelian tercatat.
                </TableCell>
              </TableRow>
            ) : (
              purchases.map((purchase) => (
                <TableRow key={purchase.id}>
                  <TableCell className="text-text-secondary">
                    {new Date(purchase.purchaseDate).toLocaleDateString(
                      'id-ID',
                    )}
                  </TableCell>
                  <TableCell className="font-medium text-text-primary">
                    {purchase.supplierName}
                  </TableCell>
                  <TableCell>
                    <CentralBranchTag branchId={purchase.branchId} />
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge
                      className={`text-[11px] ${getPaymentStatusBadgeClasses(purchase.paymentStatus)}`}
                    >
                      {formatPaymentStatus(purchase.paymentStatus)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right numeric font-mono font-medium text-accent-outflow">
                    {formatCurrency(purchase.totalAmount)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <PurchaseEntryFormDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onUnpaidPurchaseCreated={handleUnpaidPurchaseCreated}
      />
    </div>
  );
}
