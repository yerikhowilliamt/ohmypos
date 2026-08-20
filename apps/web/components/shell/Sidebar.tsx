'use client';

import * as React from 'react';
import type { UserResponse } from '@ohmypos/api-contracts';
import { Input } from '@ohmypos/ui/components/input';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@ohmypos/ui/components/collapsible';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ohmypos/ui/components/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@ohmypos/ui/components/tooltip';
import { cn } from '@ohmypos/ui/lib/utils';
import { ChevronDown, LogOut, Search, Settings } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useIsRail } from '@/hooks/useMediaQuery';
import { apiFetch } from '@/lib/api';
import {
  filterNavItems,
  getNavItems,
  isNavItemActive,
  type NavItem,
} from '@/lib/nav-config';
import { SidebarAccountCard } from './SidebarAccountCard';

/**
 * DESIGN.md §16 + §41.5. `min-h-10` is the 40px minimum touch target; the row
 * is a tinted pill when active, never a fully saturated block.
 */
const ROW =
  'relative flex min-h-10 items-center gap-2.5 rounded-sm px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus-ring';
const ROW_ACTIVE = 'bg-surface-strong font-semibold text-brand-primary';
const ROW_IDLE =
  'text-text-secondary hover:bg-surface-muted hover:text-text-primary';
/** The 64px rail: no label, so the row becomes a centered 40px square. */
const RAIL_ROW =
  'relative mx-auto flex size-10 items-center justify-center rounded-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus-ring';

/** §16: "brand indicator" — a 3px bar on the leading edge of the active row. */
function ActiveIndicator() {
  return (
    <span
      aria-hidden
      className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-pill bg-brand-primary"
    />
  );
}

function ComingSoonTag() {
  return (
    <span className="ml-auto shrink-0 rounded-pill bg-surface-muted px-2 py-0.5 text-xs font-medium text-text-tertiary">
      Coming soon
    </span>
  );
}

/**
 * Renders only the nav links `role` can reach (System Design §5). This is UX
 * only — RoleGuard/BranchScopeGuard in apps/api are the real enforcement.
 */
export function Sidebar({ user }: { user: UserResponse }) {
  const pathname = usePathname();
  const router = useRouter();
  const isRail = useIsRail();
  const [query, setQuery] = React.useState('');
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);

  const items = React.useMemo(() => getNavItems(user.role), [user.role]);
  const visible = React.useMemo(
    () => filterNavItems(items, query),
    [items, query],
  );

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch {
      setIsLoggingOut(false);
    }
  };

  const isSettingsActive = pathname === '/profile';

  return (
    <aside
      data-testid="sidebar"
      data-rail={isRail || undefined}
      aria-label="Navigasi utama"
      className={cn(
        'sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border-default bg-surface-raised md:flex',
        isRail ? 'w-16' : 'w-54',
      )}
    >
      {/* Brand mark — §16, top of the sidebar */}
      <div
        className={cn(
          'flex h-14 shrink-0 items-center',
          isRail ? 'justify-center' : 'px-3',
        )}
      >
        <Link
          href="/"
          aria-label="OhMyPos"
          className="inline-flex items-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          {isRail ? (
            <Image
              src="/logo.png"
              alt="OhMyPos"
              width={32}
              height={32}
              priority
              className="h-6 w-full object-contain"
            />
          ) : (
            <Image
              src="/logo.svg"
              alt="OhMyPos"
              width={142}
              height={40}
              priority
              className="h-6 w-full object-contain"
            />
          )}
        </Link>
      </div>

      {/* Sidebar search — §16. Hidden on the rail: there is no room for an
          input, and the rail's flyouts already expose every child. */}
      {!isRail && (
        <div className="relative px-3 pb-3">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-5 top-2/5 size-4 -translate-y-1/2 text-text-tertiary"
          />
          <Input
            type="search"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari menu…"
            aria-label="Cari menu"
            data-testid="sidebar-search"
            className="h-9 pl-9"
          />
        </div>
      )}

      {/* "Menu" section label — §16 */}
      {!isRail && (
        <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wider text-text-tertiary">
          Menu
        </p>
      )}

      <nav
        aria-label="Menu"
        className={cn(
          'flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pb-2',
          isRail ? 'px-2' : 'px-3',
        )}
      >
        {visible.length === 0 && (
          <p className="px-3 py-2 text-xs text-text-tertiary">
            Menu tidak ditemukan.
          </p>
        )}

        {visible.map((item) =>
          isRail ? (
            <RailNavItem key={item.href} item={item} pathname={pathname} />
          ) : (
            <ExpandedNavItem key={item.href} item={item} pathname={pathname} />
          ),
        )}
      </nav>

      {/* Bottom-pinned block — §16: Settings, Log out, then the Account Card */}
      <div
        className={cn(
          'mt-auto flex shrink-0 flex-col gap-1 border-t border-border-default py-2',
          isRail ? 'px-2' : 'px-3',
        )}
      >
        <SidebarAction
          isRail={isRail}
          label="Pengaturan"
          icon={<Settings className="size-4 shrink-0" aria-hidden />}
          href="/profile"
          isActive={isSettingsActive}
        />
        <SidebarAction
          isRail={isRail}
          label={isLoggingOut ? 'Keluar…' : 'Keluar'}
          icon={<LogOut className="size-4 shrink-0" aria-hidden />}
          onClick={handleLogout}
          disabled={isLoggingOut}
          tone="danger"
        />
        <SidebarAccountCard user={user} isRail={isRail} />
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Expanded (>=1024px)                                                 */
/* ------------------------------------------------------------------ */

function ExpandedNavItem({
  item,
  pathname,
}: {
  item: NavItem;
  pathname: string;
}) {
  const Icon = item.icon;
  const isActive = isNavItemActive(pathname, item.href);

  if (item.comingSoon) {
    return (
      <span
        data-testid={`nav-coming-soon-${item.href}`}
        className={cn(ROW, 'cursor-default text-text-tertiary')}
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        <span className="truncate">{item.label}</span>
        <ComingSoonTag />
      </span>
    );
  }

  if (item.children && item.children.length > 0) {
    return <ExpandedNavGroup item={item} pathname={pathname} />;
  }

  return (
    <Link
      href={item.href}
      aria-current={isActive ? 'page' : undefined}
      data-active={isActive || undefined}
      className={cn(ROW, isActive ? ROW_ACTIVE : ROW_IDLE)}
    >
      {isActive && <ActiveIndicator />}
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function ExpandedNavGroup({
  item,
  pathname,
}: {
  item: NavItem;
  pathname: string;
}) {
  const Icon = item.icon;
  const isSectionActive = isNavItemActive(pathname, item.href);
  const [openOverride, setOpenOverride] = React.useState<boolean | null>(null);
  const open = openOverride ?? isSectionActive;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpenOverride}
      className="flex flex-col gap-0.5"
    >
      <CollapsibleTrigger
        data-testid={`nav-group-${item.href}`}
        className={cn(
          ROW,
          'group w-full text-left',
          // §16: a collapsed parent whose section is active still reads as the
          // current section; an *expanded* parent does not, because one of its
          // children carries the active pill instead.
          isSectionActive && !open ? ROW_ACTIVE : ROW_IDLE,
        )}
      >
        {isSectionActive && !open && <ActiveIndicator />}
        <Icon className="size-4 shrink-0" aria-hidden />
        <span className="truncate">{item.label}</span>
        <ChevronDown
          aria-hidden
          className={cn(
            'ml-auto size-4 shrink-0 text-text-tertiary transition-transform duration-200',
            open && 'rotate-180 text-text-primary',
          )}
        />
      </CollapsibleTrigger>

      <CollapsibleContent className="ml-[22px] flex flex-col gap-0.5 border-l border-border-default pl-2">
        {item.children!.map((child) => {
          // Exact match only: `/sales` is a prefix of `/sales/history`.
          const childActive = pathname === child.href;
          return (
            <Link
              key={child.href}
              href={child.href}
              aria-current={childActive ? 'page' : undefined}
              data-active={childActive || undefined}
              className={cn(
                'flex min-h-10 items-center rounded-sm px-3 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                childActive
                  ? 'bg-surface-strong font-semibold text-brand-primary'
                  : // §16: non-active items in an expanded group are plain
                    // text with no background.
                    'font-medium text-text-secondary hover:text-text-primary',
              )}
            >
              <span className="truncate">{child.label}</span>
            </Link>
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}

/* ------------------------------------------------------------------ */
/* Rail (768–1023px) — DESIGN.md §41.2                                 */
/* ------------------------------------------------------------------ */

function RailNavItem({ item, pathname }: { item: NavItem; pathname: string }) {
  const Icon = item.icon;
  const isActive = isNavItemActive(pathname, item.href);

  // §41.2: an expandable group opens as a flyout submenu on the rail, not as
  // an inline indented list.
  if (item.children && item.children.length > 0 && !item.comingSoon) {
    return (
      <Popover>
        <PopoverTrigger
          data-testid={`nav-rail-group-${item.href}`}
          aria-label={item.label}
          className={cn(RAIL_ROW, isActive ? ROW_ACTIVE : ROW_IDLE)}
        >
          {isActive && <ActiveIndicator />}
          <Icon className="size-4" aria-hidden />
        </PopoverTrigger>
        <PopoverContent side="right" align="start" className="w-56 p-2">
          <p className="px-2 pb-1 text-xs font-semibold text-text-tertiary">
            {item.label}
          </p>
          {item.children!.map((child) => {
            const childActive = pathname === child.href;
            return (
              <Link
                key={child.href}
                href={child.href}
                aria-current={childActive ? 'page' : undefined}
                className={cn(
                  'flex min-h-10 items-center rounded-sm px-2 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                  childActive
                    ? 'bg-surface-strong font-semibold text-brand-primary'
                    : 'font-medium text-text-secondary hover:bg-surface-muted hover:text-text-primary',
                )}
              >
                {child.label}
              </Link>
            );
          })}
        </PopoverContent>
      </Popover>
    );
  }

  // §41.2: labels appear in a tooltip, not permanently. `aria-label` carries
  // the same text for screen readers and for tests, since a Radix tooltip only
  // renders on hover/focus (§43: hover is never the only path).
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={item.comingSoon ? '#' : item.href}
          aria-disabled={item.comingSoon || undefined}
          aria-current={isActive ? 'page' : undefined}
          aria-label={item.label}
          data-active={isActive || undefined}
          className={cn(
            RAIL_ROW,
            item.comingSoon
              ? 'pointer-events-none text-text-tertiary'
              : isActive
                ? ROW_ACTIVE
                : ROW_IDLE,
          )}
        >
          {isActive && <ActiveIndicator />}
          <Icon className="size-4" aria-hidden />
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">
        {item.comingSoon ? `${item.label} — Coming soon` : item.label}
      </TooltipContent>
    </Tooltip>
  );
}

/* ------------------------------------------------------------------ */
/* Bottom-pinned actions                                               */
/* ------------------------------------------------------------------ */

function SidebarAction({
  isRail,
  label,
  icon,
  href,
  onClick,
  disabled,
  isActive,
  tone = 'default',
}: {
  isRail: boolean;
  label: string;
  icon: React.ReactNode;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  isActive?: boolean;
  tone?: 'default' | 'danger';
}) {
  const className = cn(
    isRail ? RAIL_ROW : ROW,
    tone === 'danger'
      ? 'text-status-danger hover:bg-surface-muted disabled:opacity-50'
      : isActive
        ? ROW_ACTIVE
        : ROW_IDLE,
    !isRail && 'cursor-pointer',
  );

  const body = (
    <>
      {isActive && <ActiveIndicator />}
      {icon}
      {!isRail && <span className="truncate">{label}</span>}
    </>
  );

  const control = href ? (
    <Link href={href} aria-label={label} className={className}>
      {body}
    </Link>
  ) : (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(className, 'w-full text-left')}
    >
      {body}
    </button>
  );

  if (!isRail) return control;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{control}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
