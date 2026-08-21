'use client';

import * as React from 'react';
import { cn } from '@ohmypos/ui/lib/utils';
import type { BucketCount, ProductBucket } from '@/lib/pos/product-filters';

interface CategoryFilterRowProps {
  buckets: BucketCount[];
  selected: ProductBucket;
  onSelect: (bucket: ProductBucket) => void;
}

/**
 * DESIGN.md §22. The cards are bordered, radius.md, surface.raised, and carry a
 * count in tertiary text — not pill tabs, which §11/§22 reserve for badges and
 * tags. §41.3 keeps this a single row that scrolls horizontally on mobile
 * rather than wrapping.
 *
 * On the buckets themselves — availability rather than menu categories — see
 * the "Decision on record" section of the Phase 2 plan.
 */
export function CategoryFilterRow({
  buckets,
  selected,
  onSelect,
}: CategoryFilterRowProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Filter produk"
      data-testid="pos-filter-row"
      // -mx/px pair lets the row bleed to the panel edge while scrolling.
      className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1"
    >
      {buckets.map((bucket) => {
        const isSelected = bucket.id === selected;
        return (
          <button
            key={bucket.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            data-testid={`pos-filter-${bucket.id}`}
            onClick={() => onSelect(bucket.id)}
            className={cn(
              // min-w keeps the cards a consistent size; min-h-16 clears the
              // 40px touch minimum with room to spare (§41.5).
              'flex min-h-16 min-w-32 shrink-0 cursor-pointer flex-col justify-center rounded-md border px-4 py-2 text-left transition-colors',
              'outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
              isSelected
                ? 'border-brand-primary bg-surface-strong'
                : 'border-border-default bg-surface-raised hover:border-border-strong',
            )}
          >
            <span
              className={cn(
                'text-sm font-medium',
                isSelected ? 'text-brand-primary' : 'text-text-primary',
              )}
            >
              {bucket.label}
            </span>
            <span className="numeric mt-0.5 font-mono text-xs text-text-tertiary">
              {bucket.count} item
            </span>
          </button>
        );
      })}
    </div>
  );
}
