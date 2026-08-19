'use client';

import * as React from 'react';
import type { SaleResponse } from '@ohmypos/api-contracts';
import { Button } from '@ohmypos/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ohmypos/ui/components/dialog';
import { formatCurrency, formatQuantity } from '@/lib/formatters';
import { Printer } from 'lucide-react';

interface SaleReceiptDialogProps {
  sale: SaleResponse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessName?: string;
}

export function SaleReceiptDialog({
  sale,
  open,
  onOpenChange,
  businessName = process.env.NEXT_PUBLIC_BUSINESS_NAME || 'OhMyPos',
}: SaleReceiptDialogProps) {
  const handlePrint = () => {
    window.print();
  };

  if (!sale) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md print:border-none print:shadow-none print:p-0">
        <DialogHeader className="text-center sm:text-center print:text-center border-b border-border-default pb-3">
          <div className="space-y-0.5">
            <h2 className="text-xl font-black tracking-tight text-text-primary uppercase">
              {businessName}
            </h2>
            {sale.branchName && (
              <p className="text-xs font-semibold text-text-secondary">
                Cabang {sale.branchName}
              </p>
            )}
          </div>
          <DialogTitle className="sr-only">Struk Penjualan</DialogTitle>
          <div className="text-xs text-text-secondary mt-2 space-y-0.5 font-mono">
            <p>ID: #{sale.id.slice(0, 8).toUpperCase()}</p>
            <p>
              {new Date(sale.soldAt).toLocaleString('id-ID', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </p>
            <p>Kasir: {sale.cashierName}</p>
          </div>
        </DialogHeader>

        <div className="py-2 space-y-3 font-mono text-xs">
          <div className="border-b border-border-default border-dashed pb-2">
            <table className="w-full text-left">
              <thead>
                <tr className="text-text-tertiary border-b border-border-default">
                  <th className="py-1 font-medium">Item</th>
                  <th className="py-1 text-center font-medium">Qty</th>
                  <th className="py-1 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-default/50">
                {sale.items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-1.5 pr-2">
                      <div className="font-medium text-text-primary">
                        {item.productName}
                      </div>
                      <div className="text-[10px] text-text-tertiary">
                        @{formatCurrency(item.unitPriceAtSale)}
                        {item.isPriceOverridden && ' (khusus)'}
                      </div>
                    </td>
                    <td className="py-1.5 text-center text-text-secondary align-top">
                      {formatQuantity(item.quantity)}
                    </td>
                    <td className="py-1.5 text-right font-medium text-text-primary align-top">
                      {formatCurrency(item.lineTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-text-secondary">Metode Pembayaran</span>
              <span className="font-semibold text-text-primary">
                {sale.accountName}
              </span>
            </div>
            <div className="flex justify-between text-sm font-bold border-t border-border-default pt-2">
              <span className="text-text-primary">TOTAL</span>
              <span className="text-accent-inflow">
                {formatCurrency(sale.totalAmount)}
              </span>
            </div>
          </div>

          <div className="text-center text-[10px] text-text-tertiary pt-3 border-t border-border-default border-dashed">
            <p>Terima kasih atas kunjungan Anda!</p>
            <p>Simpan struk ini sebagai bukti pembayaran yang sah.</p>
          </div>
        </div>

        <DialogFooter className="print:hidden flex flex-row gap-2 justify-end pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Tutup
          </Button>
          <Button type="button" onClick={handlePrint} className="gap-1.5">
            <Printer className="size-4" />
            Cetak Struk
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
