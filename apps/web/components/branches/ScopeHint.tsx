import * as React from 'react';
import { Info } from 'lucide-react';

interface ScopeHintProps {
  children: React.ReactNode;
}

/**
 * One-line note shown beside "Semua Cabang": `Umum` is the system branch (no
 * single branch), while "Semua Cabang" means no filter and already includes Umum.
 */
export function ScopeHint({ children }: ScopeHintProps) {
  return (
    <p className="flex items-start gap-1.5 text-xs text-text-secondary">
      <Info className="mt-0.5 size-3.5 shrink-0 text-text-tertiary" />
      <span>{children}</span>
    </p>
  );
}
