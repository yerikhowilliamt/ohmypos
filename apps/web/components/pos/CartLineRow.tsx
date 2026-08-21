'use client';

import * as React from 'react';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@ohmypos/ui/components/badge';
import { Button } from '@ohmypos/ui/components/button';
import { CurrencyInput } from '@ohmypos/ui/components/currency-input';
import { Label } from '@ohmypos/ui/components/label';
import { cn } from '@ohmypos/ui/lib/utils';
import { formatCurrency } from '@/lib/formatters';
import { effectiveUnitPrice, type CartLine } from '@/lib/pos/cart.reducer';
import { lineTotal } from '@/lib/pos/cart-totals';

interface CartLineRowProps {
  line: CartLine;
  /** Advisory: this line's product competes for a material the cart over-claims. */
  isOverCommitted: boolean;
  onIncrement: (lineId: string) => void;
  onDecrement: (lineId: string) => void;
  onRemove: (lineId: string) => void;
  onPriceChange: (lineId: string, price: string | null) => void;
}

/**
 * DESIGN.md §24/§25: item, quantity, line subtotal, and quantity controls that
 * do not require precision clicking. The price field is PRD §5.2's override —
 * and, per ADR-015, the only discount mechanism that exists in v1.
 */
export function CartLineRow({
  line,
  isOverCommitted,
  onIncrement,
  onDecrement,
  onRemove,
  onPriceChange,
}: CartLineRowProps) {
  const isOverridden = line.overridePrice !== null;

  return (
    <li
      data-testid={`cart-line-${line.id}`}
      data-over-committed={isOverCommitted || undefined}
      className={cn(
        'flex flex-col gap-2 rounded-sm border p-3',
        isOverCommitted
          ? 'border-status-danger/50 bg-status-danger/5'
          : 'border-border-default bg-surface-raised',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-text-primary">
          {line.productName}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Hapus ${line.productName}`}
          data-testid={`cart-remove-${line.id}`}
          onClick={() => onRemove(line.id)}
        >
          <Trash2 className="size-4 text-text-tertiary" aria-hidden />
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={`Kurangi ${line.productName}`}
          data-testid={`cart-decrement-${line.id}`}
          onClick={() => onDecrement(line.id)}
        >
          <Minus className="size-4" aria-hidden />
        </Button>

        <span
          data-testid={`cart-quantity-${line.id}`}
          aria-label={`Jumlah ${line.productName}`}
          className="numeric min-w-8 text-center font-mono text-sm font-semibold text-text-primary"
        >
          {line.quantity}
        </span>

        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={`Tambah ${line.productName}`}
          data-testid={`cart-increment-${line.id}`}
          onClick={() => onIncrement(line.id)}
        >
          <Plus className="size-4" aria-hidden />
        </Button>

        <span className="ml-auto numeric font-mono text-sm font-semibold text-text-primary">
          {formatCurrency(lineTotal(line))}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Label
          htmlFor={`cart-price-${line.id}`}
          className="shrink-0 text-xs text-text-tertiary"
        >
          Harga satuan
        </Label>
        {/* CurrencyInput.onChange emits a raw unformatted string, not an event —
            the field displays "18.000" while state keeps "18000". */}
        <CurrencyInput
          id={`cart-price-${line.id}`}
          data-testid={`cart-price-${line.id}`}
          value={effectiveUnitPrice(line)}
          onChange={(value) => onPriceChange(line.id, value)}
          className="h-8 text-xs"
        />
        {isOverridden && (
          <Badge variant="warning" className="shrink-0">
            Harga khusus
          </Badge>
        )}
      </div>
    </li>
  );
}
