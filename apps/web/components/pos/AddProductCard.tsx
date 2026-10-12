'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';

/** First grid cell; links to Data Master, where products get the recipe they need to be sellable. */
export function AddProductCard() {
  return (
    <Link
      href="/master-data"
      data-testid="pos-add-product"
      className="flex min-h-11 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border-strong bg-surface-raised p-4 text-center transition-colors outline-none hover:border-brand-primary hover:bg-surface-strong/40 focus-visible:ring-2 focus-visible:ring-focus-ring"
    >
      <span className="flex size-10 items-center justify-center rounded-pill bg-surface-muted text-text-secondary">
        <Plus className="size-5" aria-hidden />
      </span>
      <span className="text-sm font-medium text-text-secondary">
        Tambah Produk
      </span>
    </Link>
  );
}
