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
  Sidebar as SidebarPrimitive,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '@ohmypos/ui/components/sidebar';
import { cn } from '@ohmypos/ui/lib/utils';
import { ChevronDown, LogOut, Search, Settings } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import {
  filterNavItems,
  getNavItems,
  isNavItemActive,
  type NavItem,
} from '@/lib/nav-config';
import { SidebarAccountCard } from './SidebarAccountCard';

/** §16: "brand indicator" — a 3px bar on the leading edge of the active row. */
function ActiveIndicator() {
  return (
    <span
      aria-hidden
      className="absolute left-0 top-1/2 h-5 w-0.75 -translate-y-1/2 rounded-pill bg-brand-primary"
    />
  );
}

/**
 * Renders only the nav links `role` can reach (System Design §5). This is UX
 * only — RoleGuard/BranchScopeGuard in apps/api are the real enforcement.
 *
 * One tree serves all three responsive states — desktop (≥1024px,
 * expanded), tablet rail (768–1023px, icon-only), and mobile (<768px,
 * rendered inside a Sheet by `SidebarPrimitive` itself) — instead of three
 * hand-maintained copies. `state`/`isMobile` come from `useSidebar()`
 * (`AppShell` supplies `open`/`isMobile` from `useIsRail()`/`useIsMobile()`).
 */
export function Sidebar({ user }: { user: UserResponse }) {
  const pathname = usePathname();
  const router = useRouter();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const isRailCollapsed = state === 'collapsed' && !isMobile;
  const [query, setQuery] = React.useState('');
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);
  const [logoutError, setLogoutError] = React.useState<string | null>(null);

  const items = React.useMemo(() => getNavItems(user.role), [user.role]);
  const visible = React.useMemo(
    () => filterNavItems(items, query),
    [items, query],
  );

  const closeMobile = () => setOpenMobile(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    setLogoutError(null);
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch {
      setIsLoggingOut(false);
      setLogoutError('Belum berhasil keluar. Periksa koneksi lalu coba lagi.');
    }
  };

  const isSettingsActive = pathname === '/profile';

  return (
    <SidebarPrimitive
      data-testid="sidebar"
      data-rail={isRailCollapsed || undefined}
      aria-label="Navigasi utama"
    >
      {/* Brand mark — §16, top of the sidebar */}
      <SidebarHeader
        className={cn(
          'flex h-14 shrink-0 flex-row items-center',
          isRailCollapsed ? 'justify-center' : 'px-3',
        )}
      >
        <Link
          href="/"
          onClick={closeMobile}
          aria-label="OhMyPos"
          className="inline-flex w-full items-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <Image
            src="/logo-rm-bg.png"
            alt="OhMyPos"
            width={isRailCollapsed ? 32 : 120}
            height={isRailCollapsed ? 32 : 40}
            priority
            className="h-6 w-full object-contain"
          />
        </Link>
      </SidebarHeader>

      {/* Sidebar search — §16. Hidden on the rail: there is no room for an
          input, and the rail's flyouts already expose every child. */}
      {!isRailCollapsed && (
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

      <SidebarContent className={isRailCollapsed ? 'px-2' : 'px-3'}>
        <SidebarGroup>
          {!isRailCollapsed && <SidebarGroupLabel>Menu</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {visible.length === 0 && (
                <p className="px-1 py-2 text-xs text-text-tertiary">
                  Menu tidak ditemukan.
                </p>
              )}

              {visible.map((item) =>
                isRailCollapsed ? (
                  <RailNavItem
                    key={item.href}
                    item={item}
                    pathname={pathname}
                  />
                ) : (
                  <ExpandedNavItem
                    key={item.href}
                    item={item}
                    pathname={pathname}
                    onNavigate={closeMobile}
                  />
                ),
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Bottom-pinned block — §16: Settings, Log out, then the Account Card */}
      <SidebarFooter className={isRailCollapsed ? 'px-2' : 'px-3'}>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="Pengaturan"
              data-active={isSettingsActive}
            >
              <Link href="/profile" onClick={closeMobile}>
                {isSettingsActive && <ActiveIndicator />}
                <Settings className="size-4 shrink-0" aria-hidden />
                <span className="truncate">Pengaturan</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={isLoggingOut ? 'Keluar…' : 'Keluar'}
              tone="danger"
              onClick={handleLogout}
              disabled={isLoggingOut}
            >
              <LogOut className="size-4 shrink-0" aria-hidden />
              <span className="truncate">
                {isLoggingOut ? 'Keluar…' : 'Keluar'}
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {logoutError && (
            <p role="alert" className="px-3 text-xs text-status-danger">
              {logoutError}
            </p>
          )}
        </SidebarMenu>
        <SidebarAccountCard user={user} isRail={isRailCollapsed} />
      </SidebarFooter>
    </SidebarPrimitive>
  );
}

/* ------------------------------------------------------------------ */
/* Expanded (>=1024px) and mobile (<768px, inside the Sheet)           */
/* ------------------------------------------------------------------ */

function ComingSoonTag() {
  return (
    <SidebarMenuBadge className="text-text-tertiary">
      Coming soon
    </SidebarMenuBadge>
  );
}

function ExpandedNavItem({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate: () => void;
}) {
  const Icon = item.icon;
  const isActive = isNavItemActive(pathname, item.href);

  if (item.comingSoon) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          disabled
          data-testid={`nav-coming-soon-${item.href}`}
          className="cursor-default text-text-tertiary"
        >
          <Icon className="size-4 shrink-0" aria-hidden />
          <span className="truncate">{item.label}</span>
          <ComingSoonTag />
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  if (item.children && item.children.length > 0) {
    return (
      <ExpandedNavGroup
        item={item}
        pathname={pathname}
        onNavigate={onNavigate}
      />
    );
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild data-active={isActive}>
        <Link
          href={item.href}
          onClick={onNavigate}
          aria-current={isActive ? 'page' : undefined}
        >
          {isActive && <ActiveIndicator />}
          <Icon className="size-4 shrink-0" aria-hidden />
          <span className="truncate">{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function ExpandedNavGroup({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate: () => void;
}) {
  const Icon = item.icon;
  const isSectionActive = isNavItemActive(pathname, item.href);
  const [openOverride, setOpenOverride] = React.useState<boolean | null>(null);
  const open = openOverride ?? isSectionActive;

  return (
    <Collapsible open={open} onOpenChange={setOpenOverride}>
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton
            data-testid={`nav-group-${item.href}`}
            data-active={isSectionActive && !open}
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
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent asChild>
          <SidebarMenuSub>
            {item.children!.map((child) => {
              // Exact match only: `/sales` is a prefix of `/sales/history`.
              const childActive = pathname === child.href;
              return (
                <SidebarMenuSubItem key={child.href}>
                  <SidebarMenuSubButton asChild isActive={childActive}>
                    <Link
                      href={child.href}
                      onClick={onNavigate}
                      aria-current={childActive ? 'page' : undefined}
                    >
                      <span className="truncate">{child.label}</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

/* ------------------------------------------------------------------ */
/* Rail (768–1023px) — DESIGN.md §13.1 Sidebar Behaviour by Breakpoint                                 */
/* ------------------------------------------------------------------ */

function RailNavItem({ item, pathname }: { item: NavItem; pathname: string }) {
  const Icon = item.icon;
  const isActive = isNavItemActive(pathname, item.href);
  const tooltip = item.comingSoon ? `${item.label} — Coming soon` : item.label;

  // §41.2: an expandable group opens as a flyout submenu on the rail, not as
  // an inline indented list.
  if (item.children && item.children.length > 0 && !item.comingSoon) {
    return (
      <SidebarMenuItem>
        <Popover>
          <PopoverTrigger asChild>
            <SidebarMenuButton
              data-testid={`nav-rail-group-${item.href}`}
              aria-label={item.label}
              data-active={isActive}
            >
              {isActive && <ActiveIndicator />}
              <Icon className="size-4" aria-hidden />
            </SidebarMenuButton>
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
                      ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground'
                      : 'font-medium text-text-secondary hover:bg-surface-muted hover:text-text-primary',
                  )}
                >
                  {child.label}
                </Link>
              );
            })}
          </PopoverContent>
        </Popover>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        tooltip={tooltip}
        data-active={isActive && !item.comingSoon}
      >
        <Link
          href={item.comingSoon ? '#' : item.href}
          aria-disabled={item.comingSoon || undefined}
          aria-current={isActive ? 'page' : undefined}
          aria-label={item.label}
          className={
            item.comingSoon
              ? 'pointer-events-none text-text-tertiary'
              : undefined
          }
        >
          {isActive && !item.comingSoon && <ActiveIndicator />}
          <Icon className="size-4" aria-hidden />
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
