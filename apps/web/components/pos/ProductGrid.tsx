'use client';

import * as React from 'react';
import { Search } from 'lucide-react';
import type { ProductWithHppResponse } from '@ohmypos/api-contracts';
import { Input } from '@ohmypos/ui/components/input';
import { ProductCard } from './ProductCard';

interface ProductGridProps {
  products: ProductWithHppResponse[];
  headroom: Map<string, number | null>;
  inCartQuantities: Map<string, number>;
  isLoading: boolean;
  error: string | null;
  onAdd: (product: ProductWithHppResponse) => void;
}

/**
 * Product discovery — the middle zone of DESIGN.md §20's three-zone layout.
 *
 * Search only, no category strip: `Product` has no category column, so the
 * category controls in DESIGN.md §22 would be decorative. `GET /products` is
 * unpaginated master data (products.service.ts), so filtering client-side is
 * both correct and instant — DESIGN.md §23 asks for a fast, prominent search.
 */
export function ProductGrid({
  products,
  headroom,
  inCartQuantities,
  isLoading,
  error,
  onAdd,
}: ProductGridProps) {
  const [query, setQuery] = React.useState('');

  const visible = React.useMemo(() => {
    // Inactive products are rejected server-side with InactiveProductException,
    // so they are never offered.
    const sellable = products.filter((p) => p.isActive);
    const needle = query.trim().toLowerCase();
    if (!needle) return sellable;
    return sellable.filter((p) => p.name.toLowerCase().includes(needle));
  }, [products, query]);

  return (
    <section
      aria-label="Pilih produk"
      className="flex min-w-0 flex-1 flex-col gap-4"
    >
      <div className="relative flex items-center">
        <Search
          className="pointer-events-none absolute left-3 size-4 text-text-tertiary"
          aria-hidden
        />
        <Input
          id="pos-search"
          type="search"
          autoComplete="off"
          placeholder="Cari produk…"
          aria-label="Cari produk"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-10 pl-9"
        />
      </div>

      {isLoading && (
        <p className="text-sm text-text-secondary">Memuat produk…</p>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-sm border border-status-danger/30 bg-status-danger/10 p-3 text-xs text-status-danger"
        >
          {error}
        </div>
      )}

      {!isLoading && !error && visible.length === 0 && (
        <p className="text-sm text-text-secondary">
          {query.trim()
            ? `Tidak ada produk cocok dengan "${query.trim()}".`
            : 'Belum ada produk aktif. Tambahkan produk di Data Master.'}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {visible.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            headroom={headroom.get(product.id)}
            inCartQuantity={inCartQuantities.get(product.id) ?? 0}
            onAdd={onAdd}
          />
        ))}
      </div>
    </section>
  );
}
