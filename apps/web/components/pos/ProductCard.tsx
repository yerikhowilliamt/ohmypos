'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';
import type { ProductWithHppResponse } from '@ohmypos/api-contracts';
import { Badge } from '@ohmypos/ui/components/badge';
import { cn } from '@ohmypos/ui/lib/utils';
import { formatCurrency } from '@/lib/formatters';
import { canAddProduct } from '@/lib/pos/availability';

interface ProductCardProps {
  product: ProductWithHppResponse;
  /** Cart-aware makeable quantity — how many MORE can be added (ADR-013). */
  headroom: number | null | undefined;
  inCartQuantity: number;
  onAdd: (product: ProductWithHppResponse) => void;
}

/**
 * DESIGN.md §21: name, price, an add action, a large touch target, and no
 * secondary clutter. The one piece of supporting information is the advisory
 * makeable quantity — see §33 ("POS may display derived advisory makeable
 * quantity"), never a per-product stock count, which does not exist (ADR-013).
 */
export function ProductCard({
  product,
  headroom,
  inCartQuantity,
  onAdd,
}: ProductCardProps) {
  const addable = canAddProduct(product, headroom);
  const reason = !product.hasRecipe
    ? 'Belum ada resep'
    : headroom !== null && headroom !== undefined && headroom <= 0
      ? 'Stok bahan habis'
      : null;

  return (
    <button
      type="button"
      data-testid={`product-card-${product.id}`}
      disabled={!addable}
      aria-label={`Tambah ${product.name}`}
      onClick={() => onAdd(product)}
      className={cn(
        'group relative flex h-full flex-col items-start gap-2 rounded-md border border-border-default bg-surface-raised p-4 text-left shadow-1 transition-colors',
        'outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
        addable
          ? 'cursor-pointer hover:border-brand-primary hover:bg-surface-strong/40'
          : 'cursor-not-allowed opacity-60',
      )}
    >
      {inCartQuantity > 0 && (
        <span
          data-testid={`product-in-cart-${product.id}`}
          className="absolute right-3 top-3 inline-flex size-6 items-center justify-center rounded-pill bg-brand-primary text-xs font-semibold text-white"
        >
          {inCartQuantity}
        </span>
      )}

      <span className="line-clamp-2 pr-8 text-sm font-medium text-text-primary">
        {product.name}
      </span>

      <span className="numeric font-mono text-base font-semibold text-text-primary">
        {formatCurrency(product.sellPrice)}
      </span>

      <span className="mt-auto flex w-full items-center justify-between gap-2 pt-1">
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
          <span className="inline-flex size-7 items-center justify-center rounded-sm bg-surface-muted text-text-secondary transition-colors group-hover:bg-brand-primary group-hover:text-white">
            <Plus className="size-4" aria-hidden />
          </span>
        )}
      </span>
    </button>
  );
}
