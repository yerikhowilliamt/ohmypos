'use client';

import * as React from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@ohmypos/ui/components/sheet';
import { ShoppingBag } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';

interface PosOrderSheetProps {
  itemCount: number;
  total: string;
  /** The same `<CartPanel>` element the desktop layout renders. */
  children: React.ReactNode;
}

/**
 * DESIGN.md §41.3, mobile (<768px): the Order Panel becomes a bottom sheet,
 * collapsed by default to a slim bar showing item count and Total payment plus
 * a "View Order" affordance. Tapping the bar expands the full panel content,
 * scrollable inside the sheet.
 *
 * The sheet renders the *same* `CartPanel` instance the wider layouts render,
 * passed as `children` — there is deliberately no mobile copy of the panel to
 * drift out of sync.
 *
 * The collapsed bar is not rendered when the cart is empty: §27's empty state
 * belongs in the panel, and a bar reading "0 item" would occupy the bottom of
 * every screen for no purpose.
 */
export function PosOrderSheet({
  itemCount,
  total,
  children,
}: PosOrderSheetProps) {
  const [open, setOpen] = React.useState(false);

  if (itemCount === 0) return null;

  return (
    <>
      {/* Collapsed persistent bar */}
      <button
        type="button"
        data-testid="pos-order-bar"
        onClick={() => setOpen(true)}
        aria-label={`Lihat pesanan — ${itemCount} item, total ${formatCurrency(total)}`}
        className="fixed inset-x-3 bottom-3 z-30 flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-md border border-border-default bg-surface-raised/95 p-3 text-left shadow-2 backdrop-blur-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:hidden"
      >
        <span className="flex flex-col">
          <span className="text-xs text-text-secondary">
            {itemCount} item dipilih
          </span>
          <span className="numeric font-mono text-base font-bold text-text-primary">
            {formatCurrency(total)}
          </span>
        </span>
        <span className="inline-flex min-h-11 items-center gap-1.5 rounded-sm bg-brand-primary px-4 text-sm font-medium text-white shadow-1">
          <ShoppingBag className="size-4" aria-hidden />
          Lihat Pesanan
        </span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          data-testid="pos-order-sheet"
          // The sheet is a scroll container; CartPanel's own foot stays pinned
          // inside it, so "Bayar" is reachable without scrolling the sheet.
          className="flex max-h-[85dvh] flex-col gap-3 p-3"
        >
          {/* CartPanel renders its own "Detail Pesanan" heading (§18.1) — this
              title exists only to satisfy Radix Dialog's accessible-name
              requirement, not to be seen twice. */}
          <SheetHeader className="sr-only">
            <SheetTitle>Detail Pesanan</SheetTitle>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}
