'use client';

import * as React from 'react';
import type { PaymentMethodResponse } from '@ohmypos/api-contracts';
import { Button } from '@ohmypos/ui/components/button';
import { formatCurrency } from '@/lib/formatters';
import { canSubmit, type CartState } from '@/lib/pos/cart.reducer';
import { cartItemCount, cartTotal } from '@/lib/pos/cart-totals';
import type { PaginatedSales } from '@/hooks/usePos';
import { CartErrorBanner } from './CartErrorBanner';
import { CartLineRow } from './CartLineRow';
import { PaymentMethodPicker } from './PaymentMethodPicker';

interface CartPanelProps {
  state: CartState;
  overCommittedLineIds: string[];
  paymentMethods: PaymentMethodResponse[];
  paymentMethodsLoading: boolean;
  paymentMethodsError: string | null;
  recentSales: PaginatedSales | undefined;
  isCheckingRecent: boolean;
  onIncrement: (lineId: string) => void;
  onDecrement: (lineId: string) => void;
  onRemove: (lineId: string) => void;
  onPriceChange: (lineId: string, price: string | null) => void;
  onSelectAccount: (accountId: string) => void;
  onSubmit: () => void;
  onDismissError: () => void;
  onCheckRecent: () => void;
  onClearCart: () => void;
}

/**
 * The persistent order context — the right zone of DESIGN.md §20, and a
 * first-class component per §24. Stays mounted whether or not it has lines, so
 * the cashier never loses sight of the order.
 */
export function CartPanel({
  state,
  overCommittedLineIds,
  paymentMethods,
  paymentMethodsLoading,
  paymentMethodsError,
  recentSales,
  isCheckingRecent,
  onIncrement,
  onDecrement,
  onRemove,
  onPriceChange,
  onSelectAccount,
  onSubmit,
  onDismissError,
  onCheckRecent,
  onClearCart,
}: CartPanelProps) {
  /**
   * Two independent sources of "this line is a problem", and both matter:
   *
   * - `overCommittedLineIds` is the client's own advisory arithmetic, which can
   *   only see the stock it last fetched.
   * - `submit.error.lineIds` is the server's verdict, mapped back from the 409's
   *   raw-material shortfalls. It is the authoritative one, and it routinely
   *   names lines the client thought were fine — that is precisely the case
   *   where another till drained the shared pool first (ADR-004, ADR-013).
   */
  const flaggedLineIds = React.useMemo(
    () =>
      new Set([
        ...overCommittedLineIds,
        ...(state.submit.error?.lineIds ?? []),
      ]),
    [overCommittedLineIds, state.submit.error],
  );

  const total = cartTotal(state.lines);
  const count = cartItemCount(state.lines);
  const submittable = canSubmit(state);
  const isPending = state.submit.status === 'pending';

  return (
    <aside
      id="pos-cart-panel"
      aria-label="Pesanan"
      className="flex w-full shrink-0 flex-col gap-3 rounded-md border border-border-default bg-surface-muted p-4 shadow-1 lg:w-[380px]"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">Pesanan</h2>
        {state.lines.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            data-testid="cart-clear"
            onClick={onClearCart}
          >
            Kosongkan
          </Button>
        )}
      </div>

      {state.lines.length === 0 ? (
        // DESIGN.md §27, near-verbatim copy, no decorative illustration.
        <div className="flex flex-1 flex-col items-center justify-center gap-1 py-10 text-center">
          <p className="text-sm font-medium text-text-primary">
            Pesanan masih kosong
          </p>
          <p className="text-xs text-text-secondary">
            Pilih produk untuk memulai transaksi.
          </p>
        </div>
      ) : (
        <ul className="flex flex-1 flex-col gap-2 overflow-y-auto">
          {state.lines.map((line) => (
            <CartLineRow
              key={line.id}
              line={line}
              isOverCommitted={flaggedLineIds.has(line.id)}
              onIncrement={onIncrement}
              onDecrement={onDecrement}
              onRemove={onRemove}
              onPriceChange={onPriceChange}
            />
          ))}
        </ul>
      )}

      {state.submit.error && (
        <CartErrorBanner
          error={state.submit.error}
          recentSales={recentSales}
          isCheckingRecent={isCheckingRecent}
          onCheckRecent={onCheckRecent}
          onDismiss={onDismissError}
        />
      )}

      <PaymentMethodPicker
        methods={paymentMethods}
        selectedId={state.accountId}
        isLoading={paymentMethodsLoading}
        error={paymentMethodsError}
        onSelect={onSelectAccount}
      />

      {/* DESIGN.md §26: the payable amount is highly visible and the payment
          action is the strongest control on the screen. No tax or discount line —
          totalAmount is exactly Σ lineTotal (ADR-015, DEBT-004). */}
      <div className="flex items-center justify-between border-t border-border-default pt-3">
        <span className="text-xs text-text-secondary">{count} item</span>
        <span
          data-testid="cart-total"
          className="numeric font-mono text-xl font-semibold text-text-primary"
        >
          {formatCurrency(total)}
        </span>
      </div>

      <Button
        type="button"
        size="lg"
        className="w-full"
        data-testid="cart-submit"
        disabled={!submittable}
        onClick={onSubmit}
      >
        {isPending ? 'Menyimpan…' : 'Bayar'}
      </Button>

      {state.lines.length > 0 && state.accountId === null && (
        <p className="text-center text-xs text-text-tertiary">
          Pilih metode pembayaran untuk melanjutkan.
        </p>
      )}
    </aside>
  );
}
