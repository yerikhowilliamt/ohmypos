'use client';

import * as React from 'react';
import type { PaymentMethodResponse } from '@ohmypos/api-contracts';
import { Button } from '@ohmypos/ui/components/button';
import { cn } from '@ohmypos/ui/lib/utils';
import { formatAccountType } from '@/lib/vocabulary';

interface PaymentMethodPickerProps {
  methods: PaymentMethodResponse[];
  selectedId: string | null;
  isLoading: boolean;
  error: string | null;
  onSelect: (accountId: string) => void;
}

/**
 * Payment method = `Account` (System Design §6.1, ERD §3).
 *
 * §24.3 specifies a dropdown. This stays a segmented tile control instead: §26
 * requires the payment path to remain visible, §43 forbids depending on precise
 * pointer positioning, and there are only a handful of `Account` rows, so a
 * dropdown would hide the choice behind an extra tap for no gain. §24.3's
 * placement (directly above the CTA) and visible label are both honoured.
 * Recorded as a deviation in the Phase 3 plan and the Tech Debt Log.
 *
 * Laid out as a fixed 2-column grid rather than a horizontally-scrolling row —
 * every tile is visible without scrolling, and the panel's fixed width bounds
 * the grid naturally. Tiles are deliberately compact (§41.5's 40px floor, not
 * the taller card the row version used) so a handful of accounts don't crowd
 * the summary/CTA below them.
 */
export function PaymentMethodPicker({
  methods,
  selectedId,
  isLoading,
  error,
  onSelect,
}: PaymentMethodPickerProps) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-1.5 text-xs font-medium text-text-secondary">
        Metode pembayaran:
      </legend>

      {isLoading && (
        <p className="text-xs text-text-tertiary">Memuat metode pembayaran…</p>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-sm border border-status-danger/30 bg-status-danger/10 p-2 text-xs text-status-danger"
        >
          {error}
        </div>
      )}

      {!isLoading && !error && methods.length === 0 && (
        <p className="text-xs text-text-tertiary">
          Belum ada akun pembayaran. Hubungi Owner untuk menambahkannya.
        </p>
      )}

      <div className="grid grid-cols-2 gap-1.5">
        {methods.map((method) => {
          const selected = method.id === selectedId;
          return (
            <Button
              key={method.id}
              type="button"
              variant="ghost"
              role="radio"
              aria-checked={selected}
              data-testid={`payment-method-${method.id}`}
              onClick={() => onSelect(method.id)}
              className={cn(
                'flex h-auto min-h-10 min-w-0 cursor-pointer flex-col items-start justify-center gap-0 rounded-sm border px-2.5 py-1.5 text-left transition-colors',
                'outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                selected
                  ? 'border-brand-primary bg-surface-strong text-text-primary'
                  : 'border-border-default bg-surface-raised text-text-secondary hover:bg-surface-muted',
              )}
            >
              <span className="w-full truncate text-xs font-medium">
                {method.name}
              </span>
              <span className="w-full truncate text-[11px] text-text-tertiary">
                {formatAccountType(method.type)}
              </span>
            </Button>
          );
        })}
      </div>
    </fieldset>
  );
}
