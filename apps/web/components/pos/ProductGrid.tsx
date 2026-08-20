'use client';

import * as React from 'react';
import type { ProductWithHppResponse } from '@ohmypos/api-contracts';
import { AddProductCard } from './AddProductCard';
import { ProductCard } from './ProductCard';

interface ProductGridProps {
  products: ProductWithHppResponse[];
  headroom: Map<string, number | null>;
  inCartQuantities: Map<string, number>;
  highlightedProductId: string | null;
  /** §21.1's card is shown only to roles that can reach /master-data (ADR-011). */
  canCreateProducts: boolean;
  isLoading: boolean;
  error: string | null;
  /** True when a search term or a non-ALL filter is active, for empty copy. */
  isFiltered: boolean;
  onAdd: (product: ProductWithHppResponse) => void;
}

/**
 * DESIGN.md §21: a fixed-column grid — 4 columns at desktop, 3 at tablet, 2 at
 * mobile (§41.3) — whose first cell is the Add New Product affordance (§21.1).
 * Filtering and search live in `PosScreen`, which owns the state the §22 filter
 * row and this grid share.
 */
export function ProductGrid({
  products,
  headroom,
  inCartQuantities,
  highlightedProductId,
  canCreateProducts,
  isLoading,
  error,
  isFiltered,
  onAdd,
}: ProductGridProps) {
  if (isLoading) {
    return (
      <p className="py-8 text-center text-sm text-text-secondary">
        Memuat produk…
      </p>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-sm border border-status-danger/30 bg-status-danger/10 p-3 text-xs text-status-danger"
      >
        {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {products.length === 0 && (
        // DESIGN.md §23: a distinct no-result state, distinct from empty data.
        <p className="py-8 text-center text-sm text-text-secondary">
          {isFiltered
            ? 'Tidak ada produk yang cocok dengan pencarian atau filter ini.'
            : 'Belum ada produk aktif. Tambahkan produk di Data Master.'}
        </p>
      )}

      <div
        data-testid="pos-product-grid"
        className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4"
      >
        {canCreateProducts && <AddProductCard />}
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            headroom={headroom.get(product.id)}
            inCartQuantity={inCartQuantities.get(product.id) ?? 0}
            isHighlighted={product.id === highlightedProductId}
            onAdd={onAdd}
          />
        ))}
      </div>
    </div>
  );
}
