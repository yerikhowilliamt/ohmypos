'use client';

import { formatCurrency } from '@/lib/formatters';

interface OrderSummaryProps {
  itemCount: number;
  total: string;
}

/** Order summary without service tax: subtotal equals total by construction (ADR-015). */
export function OrderSummary({ itemCount, total }: OrderSummaryProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-text-secondary">
          Subtotal ({itemCount})
        </span>
        <span className="numeric font-mono text-sm text-text-secondary">
          {formatCurrency(total)}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border-default pt-2">
        <span className="text-sm font-semibold text-text-primary">
          Total bayar
        </span>
        <span
          data-testid="cart-total"
          className="numeric font-mono text-xl font-bold text-text-primary"
        >
          {formatCurrency(total)}
        </span>
      </div>
    </div>
  );
}
