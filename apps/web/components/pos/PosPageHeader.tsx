'use client';

import * as React from 'react';
import { Input } from '@ohmypos/ui/components/input';
import { Search } from 'lucide-react';
import { formatLongDate } from '@/lib/formatters';

interface PosPageHeaderProps {
  query: string;
  onQueryChange: (value: string) => void;
}

/**
 * DESIGN.md §18 (POS variant) + §23: page title, the current operating day
 * beneath it as tertiary text, and a first-class search control right-aligned
 * in the same row, above the category row and product grid.
 */
export function PosPageHeader({ query, onQueryChange }: PosPageHeaderProps) {
  // Rendered only after mount — see the hydration note in the plan.
  const [today, setToday] = React.useState<string | null>(null);

  React.useEffect(() => {
    // Mount-only sync with the client clock (SSR has no "now") — not the
    // derived-state cascade this rule normally guards against, since nothing
    // else re-renders off `today`.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToday(formatLongDate(new Date()));
    // Re-stamp at the next local midnight so a till left open overnight does
    // not keep claiming yesterday.
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const timer = window.setTimeout(
      () => setToday(formatLongDate(new Date())),
      midnight.getTime() - now.getTime(),
    );
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-text-primary">
          Transaksi Kasir
        </h1>
        <p
          data-testid="pos-today"
          className="mt-0.5 text-sm text-text-tertiary"
          suppressHydrationWarning
        >
          {today ?? ' '}
        </p>
      </div>

      <div className="relative w-full sm:w-72">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-tertiary"
        />
        <Input
          id="pos-search"
          type="search"
          autoComplete="off"
          placeholder="Cari produk…"
          aria-label="Cari produk"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          className="h-10 pl-9"
        />
      </div>
    </div>
  );
}
