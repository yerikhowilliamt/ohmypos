'use client';

import { Minus, Plus } from 'lucide-react';
import { cn } from '@ohmypos/ui/lib/utils';

interface QuantityStepperProps {
  quantity: number;
  /** Used to build accessible names: "Kurangi Es Kopi Susu". */
  itemLabel: string;
  /** Suffix for the three data-testids: cart-decrement-${idSuffix} etc. */
  idSuffix: string;
  onIncrement: () => void;
  onDecrement: () => void;
  className?: string;
}

/**
 * [−][qty][+] control. Minus is disabled at 1, so removal goes through the row's
 * delete icon (the reducer's remove-at-1 branch stays, unreachable from here).
 */
export function QuantityStepper({
  quantity,
  itemLabel,
  idSuffix,
  onIncrement,
  onDecrement,
  className,
}: QuantityStepperProps) {
  const button =
    'flex size-8 shrink-0 cursor-pointer items-center justify-center text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <span
      className={cn(
        'inline-flex items-center overflow-hidden rounded-pill border border-border-default bg-surface-raised',
        className,
      )}
    >
      <button
        type="button"
        aria-label={`Kurangi ${itemLabel}`}
        data-testid={`cart-decrement-${idSuffix}`}
        onClick={onDecrement}
        disabled={quantity <= 1}
        className={button}
      >
        <Minus className="size-3.5" aria-hidden />
      </button>

      <span
        data-testid={`cart-quantity-${idSuffix}`}
        aria-label={`Jumlah ${itemLabel}`}
        className="numeric min-w-8 px-1 text-center font-mono text-sm font-semibold text-text-primary"
      >
        {quantity}
      </span>

      <button
        type="button"
        aria-label={`Tambah ${itemLabel}`}
        data-testid={`cart-increment-${idSuffix}`}
        onClick={onIncrement}
        className={button}
      >
        <Plus className="size-3.5" aria-hidden />
      </button>
    </span>
  );
}
