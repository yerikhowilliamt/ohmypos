'use client';

import * as React from 'react';
import { AlertTriangle, HelpCircle, X } from 'lucide-react';
import { Button } from '@ohmypos/ui/components/button';
import { cn } from '@ohmypos/ui/lib/utils';
import { formatCurrency } from '@/lib/formatters';
import type { CartError } from '@/lib/pos/cart.reducer';
import type { PaginatedSales } from '@/hooks/usePos';

interface CartErrorBannerProps {
  error: CartError;
  recentSales: PaginatedSales | undefined;
  isCheckingRecent: boolean;
  onCheckRecent: () => void;
  onDismiss: () => void;
}

/**
 * The in-cart error surface (Phase 8c plan §5). Sits inside the order panel,
 * beside the lines it refers to — never a toast, because the cashier needs to
 * read it while editing the quantities it names.
 */
export function CartErrorBanner({
  error,
  recentSales,
  isCheckingRecent,
  onCheckRecent,
  onDismiss,
}: CartErrorBannerProps) {
  const uncertain = error.kind === 'UNCERTAIN';

  return (
    <div
      role="alert"
      data-testid="cart-error-banner"
      data-kind={error.kind}
      className={cn(
        'flex flex-col gap-2 rounded-sm border p-3 text-xs',
        uncertain
          ? 'border-status-warning/40 bg-status-warning/10 text-text-primary'
          : 'border-status-danger/30 bg-status-danger/10 text-status-danger',
      )}
    >
      <div className="flex items-start gap-2">
        {uncertain ? (
          <HelpCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
        ) : (
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
        )}
        <p className="flex-1 leading-relaxed">{error.message}</p>
        {!uncertain && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Tutup pesan"
            onClick={onDismiss}
          >
            <X className="size-3" aria-hidden />
          </Button>
        )}
      </div>

      {/*
        An uncertain submit gets no "Coba lagi": POST /sales has no idempotency
        key, so a blind retry can double-write a LedgerEntry. The cashier verifies
        first (plan §5).
      */}
      {uncertain && (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            data-testid="check-recent-sales"
            disabled={isCheckingRecent}
            onClick={onCheckRecent}
          >
            {isCheckingRecent ? 'Memeriksa…' : 'Periksa transaksi terakhir'}
          </Button>

          {recentSales && (
            <div className="rounded-sm border border-border-default bg-surface-raised p-2">
              {recentSales.data.length === 0 ? (
                <p className="text-text-secondary">
                  Belum ada penjualan tercatat di cabang ini.
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {recentSales.data.map((sale) => (
                    <li
                      key={sale.id}
                      className="flex items-center justify-between gap-3 text-text-secondary"
                    >
                      <span>
                        {new Date(sale.soldAt).toLocaleString('id-ID', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </span>
                      <span className="numeric font-mono text-text-primary">
                        {formatCurrency(sale.totalAmount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-text-tertiary">
                Jika transaksi Anda sudah ada di daftar ini, kosongkan
                keranjang. Jika belum, catat ulang.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
