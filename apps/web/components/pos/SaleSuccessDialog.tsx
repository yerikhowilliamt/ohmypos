'use client';

import * as React from 'react';
import type { SaleResponse } from '@ohmypos/api-contracts';
import { Button } from '@ohmypos/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ohmypos/ui/components/dialog';
import { formatCurrency, formatQuantity } from '@/lib/formatters';

interface SaleSuccessDialogProps {
  sale: SaleResponse | null;
  onClose: () => void;
  businessName?: string;
}

/**
 * The receipt summary, rendered from the 201 response.
 *
 * It must come from the POST body and nothing else: `GET /sales/:id` is
 * OWNER/ADMIN-only (sales.controller.ts), so a KASIR cannot refetch the sale they
 * just created. Nothing shown here is recomputed client-side — `totalAmount` is
 * the server's number.
 */
export function SaleSuccessDialog({
  sale,
  onClose,
  businessName = process.env.NEXT_PUBLIC_BUSINESS_NAME || 'OhMyPos',
}: SaleSuccessDialogProps) {
  return (
    <Dialog open={sale !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="space-y-0.5">
            <h2 className="text-base font-bold text-text-primary">
              {businessName}
            </h2>
            {sale && (
              <p className="text-xs text-text-secondary">
                Cabang {sale.branchName}
              </p>
            )}
          </div>
          <DialogTitle>Penjualan tercatat</DialogTitle>
          <DialogDescription>
            {sale
              ? `${sale.accountName} · ${new Date(sale.soldAt).toLocaleString(
                  'id-ID',
                  {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  },
                )}`
              : null}
          </DialogDescription>
        </DialogHeader>

        {sale && (
          <div className="flex flex-col gap-3">
            <ul className="flex flex-col gap-1.5">
              {sale.items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start justify-between gap-3 text-sm"
                >
                  <span className="text-text-secondary">
                    {item.productName}
                    <span className="ml-1 text-text-tertiary">
                      × {formatQuantity(item.quantity)}
                    </span>
                    {item.isPriceOverridden && (
                      <span className="ml-1 text-status-warning">
                        (harga khusus)
                      </span>
                    )}
                  </span>
                  <span className="numeric shrink-0 font-mono text-text-primary">
                    {formatCurrency(item.lineTotal)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-between border-t border-border-default pt-3">
              <span className="text-sm font-medium text-text-primary">
                Total
              </span>
              {/* Flow Indicator — money in (DESIGN.md §12.2 Signature Flow Indicator). */}
              <span
                data-testid="sale-success-total"
                className="numeric font-mono text-lg font-semibold text-accent-inflow"
              >
                {formatCurrency(sale.totalAmount)}
              </span>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            onClick={onClose}
            data-testid="sale-success-close"
          >
            Transaksi baru
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
