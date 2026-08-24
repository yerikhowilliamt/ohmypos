'use client';

import { formatCurrency } from '@/lib/formatters';

interface OrderSummaryProps {
  itemCount: number;
  total: string;
}

/**
 * DESIGN.md §11.4 Order Panel, minus the Service Tax row: `Sale.totalAmount` is Σ line
 * totals and nothing else (schema.prisma, ADR-015 decision 1), so subtotal and
 * total are the same number by construction. Both are still shown, because
 * §24.2 asks the count to be visible next to the money and because a single
 * unlabelled figure reads as an assertion the cashier cannot check.
 *
 * All monetary values right-aligned, JetBrains Mono (§8, §24.2).
 */
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
