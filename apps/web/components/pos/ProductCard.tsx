'use client';

import * as React from 'react';
import { ImageOff, Plus } from 'lucide-react';
import type { ProductWithHppResponse } from '@ohmypos/api-contracts';
import { Badge } from '@ohmypos/ui/components/badge';
import { Button } from '@ohmypos/ui/components/button';
import { cn } from '@ohmypos/ui/lib/utils';
import { formatCurrency } from '@/lib/formatters';
import { canAddProduct } from '@/lib/pos/availability';

interface ProductCardProps {
  product: ProductWithHppResponse;
  /** Cart-aware makeable quantity — how many MORE can be added (ADR-013). */
  headroom: number | null | undefined;
  inCartQuantity: number;
  /** DESIGN.md §11.2 Product Grid & Cards: the most recently added product carries a brand border. */
  isHighlighted: boolean;
  onAdd: (product: ProductWithHppResponse) => void;
}

/**
 * DESIGN.md §11.2 Product Grid & Cards: image edge-to-edge at the top, name below, price below that,
 * a large touch area, and no secondary clutter. The one piece of supporting
 * information is the advisory makeable quantity — see §33 ("POS may display
 * derived advisory makeable quantity"), never a per-product stock count, which
 * does not exist (ADR-013).
 *
 * No discount tag (§21.2): `Product` has no discount field and ADR-015 gave v1
 * none — the per-line price override in the cart is the whole mechanism.
 */
export function ProductCard({
  product,
  headroom,
  inCartQuantity,
  isHighlighted,
  onAdd,
}: ProductCardProps) {
  const addable = canAddProduct(product, headroom);
  const reason = !product.hasRecipe
    ? 'Belum ada resep'
    : headroom !== null && headroom !== undefined && headroom <= 0
      ? 'Stok bahan habis'
      : null;

  return (
    <Button
      type="button"
      variant="ghost"
      data-testid={`product-card-${product.id}`}
      data-highlighted={isHighlighted || undefined}
      disabled={!addable}
      aria-label={`Tambah ${product.name}`}
      onClick={() => onAdd(product)}
      className={cn(
        // h-auto + p-0: the image has to reach the card's edges, so padding
        // lives on the inner text block instead of the button.
        'group relative flex h-auto flex-col items-stretch gap-0 overflow-hidden rounded-lg border bg-surface-raised p-0 text-left shadow-1 transition-colors',
        'outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
        isHighlighted ? 'border-brand-primary' : 'border-border-default',
        addable
          ? 'cursor-pointer hover:border-brand-primary'
          : 'cursor-not-allowed opacity-60',
      )}
    >
      {inCartQuantity > 0 && (
        <span
          data-testid={`product-in-cart-${product.id}`}
          className="absolute right-2 top-2 z-10 inline-flex size-6 items-center justify-center rounded-pill bg-brand-primary text-xs font-semibold text-white shadow-1"
        >
          {inCartQuantity}
        </span>
      )}

      {/* §21: the image fills the top of the card. A fixed aspect ratio keeps
          every card in a row the same height whether or not a photo exists. */}
      <span className="relative block aspect-[4/3] w-full overflow-hidden bg-surface-muted">
        {product.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.photoUrl}
            alt=""
            className="size-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <span className="flex size-full items-center justify-center text-text-tertiary">
            <ImageOff className="size-6" aria-hidden />
          </span>
        )}
      </span>

      <span className="flex flex-1 flex-col gap-1 p-3">
        <span className="line-clamp-2 text-sm font-medium text-text-primary">
          {product.name}
        </span>

        <span className="numeric font-mono text-base font-semibold text-text-primary">
          {formatCurrency(product.sellPrice)}
        </span>

        <span className="mt-auto flex w-full items-center justify-between gap-2 pt-1.5">
          {reason ? (
            <Badge variant="outline" className="text-text-tertiary">
              {reason}
            </Badge>
          ) : (
            <span
              data-testid={`product-headroom-${product.id}`}
              className="text-xs text-text-tertiary"
            >
              {headroom === null || headroom === undefined
                ? '—'
                : `Bisa dibuat ${headroom}`}
            </span>
          )}

          {addable && (
            <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-sm bg-surface-muted text-text-secondary transition-colors group-hover:bg-brand-primary group-hover:text-white">
              <Plus className="size-4" aria-hidden />
            </span>
          )}
        </span>
      </span>
    </Button>
  );
}
