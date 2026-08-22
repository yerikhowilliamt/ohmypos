'use client';

import { Button } from '@ohmypos/ui/components/button';
import { useSidebar } from '@ohmypos/ui/components/sidebar';
import { Menu, Moon, Sun } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { Theme } from '@/lib/theme';

interface TopbarProps {
  /**
   * `'default'` renders the 52px Backoffice strip from DESIGN.md §10 Application Shell & Navigation, §10.3 Topbar Specifications.
   * `'pos'` renders only the mobile hamburger row — §15 is explicit that POS
   * has no separate horizontal topbar.
   */
  variant?: 'default' | 'pos';
  /**
   * Current-page orientation (§17), e.g. `["Data Master", "Bahan Baku"]`.
   * Desktop-only — mobile has no room next to the hamburger + logo row, and
   * the page's own header (§18) already carries the title there.
   */
  breadcrumb?: string[];
  /** Back-office-only dark mode toggle — never passed for POS or shared
   * routes, so the button structurally cannot render there. */
  enableDarkMode?: boolean;
  theme?: Theme;
  onToggleTheme?: () => void;
}

export function Topbar({
  variant = 'default',
  breadcrumb,
  enableDarkMode,
  theme,
  onToggleTheme,
}: TopbarProps) {
  const { setOpenMobile } = useSidebar();

  return (
    <header
      data-testid="topbar"
      className={
        variant === 'pos'
          ? 'flex h-13 shrink-0 items-center justify-between border-b border-border-default bg-surface-raised px-4 md:hidden'
          : 'flex h-13 shrink-0 items-center justify-between border-b border-border-default bg-surface-raised px-4 md:px-5 xl:px-6'
      }
    >
      <div className="flex items-center gap-3">
        {/* Below 768px the sidebar is hidden (§41.2) and this is the only way in. */}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => setOpenMobile(true)}
          aria-label="Buka menu"
          className="flex size-10 items-center justify-center rounded-sm text-text-secondary hover:bg-surface-muted hover:text-text-primary md:hidden"
        >
          <Menu className="size-5" />
        </Button>

        <Link href="/" className="flex items-center md:hidden">
          <Image
            src="/logo-rm-bg.png"
            alt="OhMyPos"
            width={110}
            height={30}
            priority
            className="h-6 w-auto object-contain"
          />
        </Link>

        {variant === 'default' && breadcrumb && breadcrumb.length > 0 && (
          <nav
            aria-label="Breadcrumb"
            data-testid="topbar-breadcrumb"
            className="hidden items-center gap-1.5 text-xs text-text-tertiary md:flex"
          >
            {breadcrumb.map((segment, idx) => (
              <span key={segment} className="flex items-center gap-1.5">
                {idx > 0 && <span aria-hidden>›</span>}
                <span
                  className={
                    idx === breadcrumb.length - 1
                      ? 'font-medium text-text-secondary'
                      : undefined
                  }
                >
                  {segment}
                </span>
              </span>
            ))}
          </nav>
        )}
      </div>

      {/* Mobile theme toggle for pos & default when dark mode is enabled */}
      {enableDarkMode && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onToggleTheme}
          aria-pressed={theme === 'dark'}
          aria-label={
            theme === 'dark' ? 'Ganti ke mode terang' : 'Ganti ke mode gelap'
          }
          data-testid="topbar-theme-toggle-mobile"
          className="flex size-10 items-center justify-center rounded-sm text-text-secondary hover:bg-surface-muted hover:text-text-primary md:hidden"
        >
          {theme === 'dark' ? (
            <Sun className="size-5" />
          ) : (
            <Moon className="size-5" />
          )}
        </Button>
      )}

      <div className="hidden items-center gap-2 md:flex">
        {/* Back-office-only (§8.2 of the current DESIGN.md) — never rendered
            for POS (`variant='pos'` never reaches this block) or shared
            routes (`enableDarkMode` is never passed there). */}
        {variant === 'default' && enableDarkMode && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onToggleTheme}
            aria-pressed={theme === 'dark'}
            aria-label={
              theme === 'dark' ? 'Ganti ke mode terang' : 'Ganti ke mode gelap'
            }
            data-testid="topbar-theme-toggle"
            className="flex size-9 items-center justify-center rounded-sm text-text-secondary hover:bg-surface-muted hover:text-text-primary"
          >
            {theme === 'dark' ? (
              <Sun className="size-4" />
            ) : (
              <Moon className="size-4" />
            )}
          </Button>
        )}

        {/* Branch context — §17. Back-office data is all-branch by
            construction: stock and cash are centralized pools with no
            per-branch balance anywhere in the schema (ADR-004), so this is a
            statement of fact, not a disabled selector. There is no
            branch-switch control in v1. */}
        {variant === 'default' && (
          <span
            data-testid="topbar-branch-context"
            className="inline-flex items-center gap-2 rounded-pill bg-surface-muted px-3 py-1 text-xs font-medium text-text-secondary"
          >
            <span
              aria-hidden
              className="size-1.5 rounded-pill bg-accent-inflow"
            />
            Semua Cabang
          </span>
        )}
      </div>
    </header>
  );
}
