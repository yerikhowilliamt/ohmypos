'use client';

import * as React from 'react';
import type { PaymentMethodResponse } from '@ohmypos/api-contracts';
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
 * Rendered as selectable tiles rather than a dropdown: DESIGN.md §26 requires the
 * payment path to stay visible and touch-friendly, and §43 asks for larger touch
 * targets in POS. There are only a handful of accounts, so a `<select>` would hide
 * the choice behind an extra tap for no gain.
 */
export function PaymentMethodPicker({
  methods,
  selectedId,
  isLoading,
  error,
  onSelect,
}: PaymentMethodPickerProps) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-xs font-medium text-text-secondary">
        Metode pembayaran
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

      <div className="flex flex-wrap gap-2">
        {methods.map((method) => {
          const selected = method.id === selectedId;
          return (
            <button
              key={method.id}
              type="button"
              role="radio"
              aria-checked={selected}
              data-testid={`payment-method-${method.id}`}
              onClick={() => onSelect(method.id)}
              className={cn(
                'flex min-h-11 cursor-pointer flex-col items-start rounded-sm border px-3 py-2 text-left transition-colors',
                'outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                selected
                  ? 'border-brand-primary bg-surface-strong text-text-primary'
                  : 'border-border-default bg-surface-raised text-text-secondary hover:bg-surface-muted',
              )}
            >
              <span className="text-sm font-medium">{method.name}</span>
              <span className="text-xs text-text-tertiary">
                {formatAccountType(method.type)}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
