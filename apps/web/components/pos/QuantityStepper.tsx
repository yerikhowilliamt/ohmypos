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
 * DESIGN.md §25: one bordered container holding [−][qty][+] so it reads as a
 * single control rather than three buttons.
 *
 * `disabled={quantity <= 1}` is deliberate. DESIGN.md §25 now says removal
 * happens "via the row's dedicated delete icon, not by decrementing to zero",
 * but `cartReducer`'s DECREMENT still removes the line at quantity 1 (its
 * comment cites an earlier reading of §25). Disabling the button here makes the
 * UI follow the current §25 without touching a tested money-path reducer — the
 * remove-at-1 branch simply becomes unreachable from the stepper. See §1.1.
 *
 * The buttons are 32px inside a 32px-tall control, below §41.5's 40px minimum
 * on their own; the wrapper's `py-1 -my-1` hit-slop plus the row's vertical
 * padding brings the effective target to 40px without making the pill tall
 * enough to dominate the row.
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
