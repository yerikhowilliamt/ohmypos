'use client';

import * as React from 'react';
import { ImageOff, Pencil, Trash2 } from 'lucide-react';
import { Badge } from '@ohmypos/ui/components/badge';
import { CurrencyInput } from '@ohmypos/ui/components/currency-input';
import { Label } from '@ohmypos/ui/components/label';
import { cn } from '@ohmypos/ui/lib/utils';
import { formatCurrency } from '@/lib/formatters';
import { effectiveUnitPrice, type CartLine } from '@/lib/pos/cart.reducer';
import { lineTotal } from '@/lib/pos/cart-totals';
import { QuantityStepper } from './QuantityStepper';

interface CartLineRowProps {
  line: CartLine;
  /** Resolved by CartPanel from the product list — CartLine has no photo. */
  photoUrl: string | null;
  /** Advisory: this line's product competes for a material the cart over-claims. */
  isOverCommitted: boolean;
  onIncrement: (lineId: string) => void;
  onDecrement: (lineId: string) => void;
  onRemove: (lineId: string) => void;
  onPriceChange: (lineId: string, price: string | null) => void;
}

/**
 * DESIGN.md §24.1 / §25. The unit price is not a static figure here — it is the
 * PRD §5.2 price override, and per ADR-015 the only discount mechanism v1 has.
 * Rendering it as an editable field rather than as text plus a separate editor
 * keeps §24.1's "unit price" and the override the same control.
 */
export function CartLineRow({
  line,
  photoUrl,
  isOverCommitted,
  onIncrement,
  onDecrement,
  onRemove,
  onPriceChange,
}: CartLineRowProps) {
  const isOverridden = line.overridePrice !== null;
  // Starts collapsed unless the line already carries an override, so a fresh
  // cart line reads as compact text (DESIGN.md §24.1) rather than a full form
  // row — the CurrencyInput only reappears once the cashier asks to edit it.
  const [isEditingPrice, setIsEditingPrice] = React.useState(isOverridden);

  return (
    <li
      data-testid={`cart-line-${line.id}`}
      data-over-committed={isOverCommitted || undefined}
      className={cn(
        // §24.1: dividers, not a border per row.
        'relative flex gap-3 border-b border-border-default px-1 py-3 last:border-b-0',
        isOverCommitted && 'bg-status-danger/5',
      )}
    >
      {isOverCommitted && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[3px] rounded-pill bg-status-danger"
        />
      )}

      {/* §24.1: small product thumbnail, radius.sm */}
      <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-surface-muted">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="" className="size-full object-cover" />
        ) : (
          <ImageOff className="size-4 text-text-tertiary" aria-hidden />
        )}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <span className="line-clamp-2 text-sm font-medium text-text-primary">
            {line.productName}
          </span>

          {/* §24.1: dedicated delete, status-danger, top-right of the row.
              40px target per §41.5 — it is not hover-revealed (§43). */}
          <button
            type="button"
            aria-label={`Hapus ${line.productName}`}
            data-testid={`cart-remove-${line.id}`}
            onClick={() => onRemove(line.id)}
            className="-mr-1 -mt-1 flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-sm text-status-danger transition-colors hover:bg-status-danger/10 outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </div>

        <div className="flex items-center justify-between gap-2">
          <QuantityStepper
            quantity={line.quantity}
            itemLabel={line.productName}
            idSuffix={line.id}
            onIncrement={() => onIncrement(line.id)}
            onDecrement={() => onDecrement(line.id)}
          />

          {/* §24.1: line total, right-aligned, JetBrains Mono */}
          <span className="numeric font-mono text-sm font-semibold text-text-primary">
            {formatCurrency(lineTotal(line))}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isEditingPrice ? (
            <>
              <Label
                htmlFor={`cart-price-${line.id}`}
                className="shrink-0 text-xs text-text-tertiary"
              >
                Harga satuan
              </Label>
              {/* CurrencyInput.onChange emits a raw unformatted string, not an
                  event — the field displays "18.000" while state keeps "18000". */}
              <CurrencyInput
                id={`cart-price-${line.id}`}
                data-testid={`cart-price-${line.id}`}
                value={effectiveUnitPrice(line)}
                onChange={(value) => onPriceChange(line.id, value)}
                className="h-8 text-xs"
                autoFocus
              />
              {isOverridden && (
                <Badge variant="warning" className="shrink-0">
                  Harga khusus
                </Badge>
              )}
            </>
          ) : (
            <button
              type="button"
              data-testid={`cart-price-edit-${line.id}`}
              onClick={() => setIsEditingPrice(true)}
              aria-label={`Ubah harga satuan ${line.productName}`}
              className="group -mx-1 flex items-center gap-1.5 rounded-xs px-1 py-0.5 text-xs text-text-tertiary outline-none transition-colors hover:bg-surface-muted hover:text-text-secondary focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <span className="numeric font-mono">
                {formatCurrency(effectiveUnitPrice(line))}/satuan
              </span>
              <Pencil
                className="size-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                aria-hidden
              />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
