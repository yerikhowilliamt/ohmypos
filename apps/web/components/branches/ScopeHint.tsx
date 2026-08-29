import * as React from 'react';
import { Info } from 'lucide-react';

interface ScopeHintProps {
  children: React.ReactNode;
}

/**
 * A muted one-line note explaining the "Umum" scope wherever it sits next to
 * "Semua Cabang".
 *
 * The two read as synonyms to an Owner ("semua cabang" = "umum") but mean
 * nearly opposite things: `Umum` is the ADR-014 ledger-attribution row —
 * transactions charged to no single branch — while `Semua Cabang` is the
 * absence of a branch filter, so it is the SUPERSET that already contains
 * Umum. Only the styling is shared; each call site writes its own sentence
 * because the noun changes (pengeluaran, pembelian, transaksi).
 */
export function ScopeHint({ children }: ScopeHintProps) {
  return (
    <p className="flex items-start gap-1.5 text-xs text-text-secondary">
      <Info className="mt-0.5 size-3.5 shrink-0 text-text-tertiary" />
      <span>{children}</span>
    </p>
  );
}
