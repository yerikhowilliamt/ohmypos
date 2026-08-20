'use client';

import { Button } from '@ohmypos/ui/components/button';
import { Menu } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

interface TopbarProps {
  onOpenMobileNav?: () => void;
  /**
   * `'default'` renders the 52px Backoffice strip from DESIGN.md §15/§17.
   * `'pos'` renders only the mobile hamburger row — §15 is explicit that POS
   * has no separate horizontal topbar.
   */
  variant?: 'default' | 'pos';
}

export function Topbar({ onOpenMobileNav, variant = 'default' }: TopbarProps) {
  return (
    <header
      data-testid="topbar"
      className={
        variant === 'pos'
          ? 'flex h-[52px] shrink-0 items-center justify-between border-b border-border-default bg-surface-raised px-4 md:hidden'
          : 'flex h-[52px] shrink-0 items-center justify-between border-b border-border-default bg-surface-raised px-4 md:px-5 xl:px-6'
      }
    >
      <div className="flex items-center gap-3">
        {/* Below 768px the sidebar is hidden (§41.2) and this is the only way in. */}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onOpenMobileNav}
          aria-label="Buka menu"
          className="flex size-10 items-center justify-center rounded-sm text-text-secondary hover:bg-surface-muted hover:text-text-primary md:hidden"
        >
          <Menu className="size-5" />
        </Button>

        <Link href="/" className="flex items-center md:hidden">
          <Image
            src="/logo.svg"
            alt="OhMyPos"
            width={110}
            height={30}
            priority
            className="h-6 w-auto object-contain"
          />
        </Link>
      </div>

      {/* Branch context — §17. Back-office data is all-branch by construction:
          stock and cash are centralized pools with no per-branch balance
          anywhere in the schema (ADR-004), so this is a statement of fact, not
          a disabled selector. There is no branch-switch control in v1. */}
      {variant === 'default' && (
        <span
          data-testid="topbar-branch-context"
          className="hidden items-center gap-2 rounded-pill bg-surface-muted px-3 py-1 text-xs font-medium text-text-secondary md:inline-flex"
        >
          <span
            aria-hidden
            className="size-1.5 rounded-pill bg-accent-inflow"
          />
          Semua Cabang
        </span>
      )}
    </header>
  );
}
