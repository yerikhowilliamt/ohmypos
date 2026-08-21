'use client';

import * as React from 'react';
import type { PaymentMethodResponse } from '@ohmypos/api-contracts';
import { Button } from '@ohmypos/ui/components/button';
import { Send, ShoppingBag } from 'lucide-react';
import { canSubmit, type CartState } from '@/lib/pos/cart.reducer';
import { cartItemCount, cartTotal } from '@/lib/pos/cart-totals';
import type { PaginatedSales } from '@/hooks/usePos';
import { CartErrorBanner } from './CartErrorBanner';
import { CartLineRow } from './CartLineRow';
import { OrderSummary } from './OrderSummary';
import { PaymentMethodPicker } from './PaymentMethodPicker';

interface CartPanelProps {
  state: CartState;
  overCommittedLineIds: string[];
  /** productId → photoUrl, resolved by PosScreen. CartLine carries no photo. */
  productPhotos: Map<string, string | null>;
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
 * The persistent order context — zone three of DESIGN.md §20, structured per
 * §24: panel header, order list, summary block, payment method, primary CTA.
 * Stays mounted whether or not it has lines, so the cashier never loses sight
 * of the order.
 *
 * Two things §24 describes are absent by decision, not oversight: the customer
 * combobox (§18.1 — no `Customer` model exists) and the Service Tax row (§24.2 —
 * `Sale.totalAmount` is Σ line totals and nothing else, ADR-015). See the
 * Phase 3 plan and DEBT-004.
 */
export function CartPanel({
  state,
  overCommittedLineIds,
  productPhotos,
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
      aria-label="Detail pesanan"
      // shrink-0 only from md up: in the desktop/tablet row layout it must
      // hold its fixed width against ProductGrid, but inside the mobile
      // bottom sheet (a bounded-height column) it has to shrink to fit so its
      // own order-list region (below) scrolls internally instead of the
      // whole panel overflowing the sheet.
      className="flex w-full min-h-0 shrink flex-col rounded-lg border border-border-default bg-surface-raised shadow-1 md:h-full md:w-[320px] md:shrink-0 lg:w-[360px] xl:w-[380px]"
    >
      {/* §18.1: the panel has its own header, independent of the page header. */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border-default p-4">
        <h2 className="text-base font-semibold text-text-primary">
          Detail Pesanan
        </h2>
        {state.lines.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            data-testid="cart-clear"
            onClick={onClearCart}
            className="text-text-tertiary hover:text-status-danger"
          >
            Kosongkan
          </Button>
        )}
      </div>

      {/* Order list — the only part that scrolls, so the CTA stays pinned. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3">
        {state.lines.length === 0 ? (
          // DESIGN.md §27, near-verbatim copy, no decorative illustration.
          <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center">
            <span
              aria-hidden
              className="flex size-10 items-center justify-center rounded-pill bg-surface-muted text-text-tertiary"
            >
              <ShoppingBag className="size-5" />
            </span>
            <p className="text-sm font-medium text-text-primary">
              Pesanan masih kosong
            </p>
            <p className="text-xs text-text-secondary">
              Pilih produk untuk memulai transaksi.
            </p>
          </div>
        ) : (
          <>
            <p className="pb-1 pt-3 text-xs font-medium text-text-tertiary">
              Pesanan Anda:
            </p>
            <ul className="flex flex-col">
              {state.lines.map((line) => (
                <CartLineRow
                  key={line.id}
                  line={line}
                  photoUrl={productPhotos.get(line.productId) ?? null}
                  isOverCommitted={flaggedLineIds.has(line.id)}
                  onIncrement={onIncrement}
                  onDecrement={onDecrement}
                  onRemove={onRemove}
                  onPriceChange={onPriceChange}
                />
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Pinned foot: summary → payment method → CTA (§24, §26).
          min-w-0 is load-bearing: without it, a flex-column child's default
          min-width:auto lets a long account/product name push its intrinsic
          content width past the panel's fixed width instead of truncating. */}
      <div className="flex min-w-0 shrink-0 flex-col gap-3 border-t border-border-default p-4">
        {state.submit.error && (
          <CartErrorBanner
            error={state.submit.error}
            recentSales={recentSales}
            isCheckingRecent={isCheckingRecent}
            onCheckRecent={onCheckRecent}
            onDismiss={onDismissError}
          />
        )}

        <OrderSummary itemCount={count} total={total} />

        <PaymentMethodPicker
          methods={paymentMethods}
          selectedId={state.accountId}
          isLoading={paymentMethodsLoading}
          error={paymentMethodsError}
          onSelect={onSelectAccount}
        />

        {/* §26: full-width, brand fill, an icon, always the lowest element. */}
        <Button
          type="button"
          size="lg"
          className="h-12 w-full gap-2"
          data-testid="cart-submit"
          disabled={!submittable}
          onClick={onSubmit}
        >
          <Send className="size-4" aria-hidden />
          {isPending ? 'Menyimpan…' : 'Bayar'}
        </Button>

        {state.lines.length > 0 && state.accountId === null && (
          <p className="text-center text-xs text-text-tertiary">
            Pilih metode pembayaran untuk melanjutkan.
          </p>
        )}
      </div>
    </aside>
  );
}
