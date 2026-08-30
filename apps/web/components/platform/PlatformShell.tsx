'use client';

import * as React from 'react';
import type { PlatformAdminResponse } from '@ohmypos/api-contracts';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { KeyRound, LogOut, ShieldAlert } from 'lucide-react';
import {
  Sidebar as SidebarPrimitive,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  useSidebar,
} from '@ohmypos/ui/components/sidebar';
import { Button } from '@ohmypos/ui/components/button';
import { cn } from '@ohmypos/ui/lib/utils';
import { Menu } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useIsMobile, useIsRail } from '@/hooks/useMediaQuery';
import { isNavItemActive, PLATFORM_NAV_ITEMS } from '@/lib/nav-config';
import { getInitials } from '@/components/shell/SidebarAccountCard';
import { ChangePasswordDialog } from './ChangePasswordDialog';

/**
 * ADR-025 — the platform console's shell.
 *
 * **Why this is not `AppShell`.** The plan called for reusing it, and that read
 * well until the two identities were laid side by side. `AppShell` is typed on
 * `UserResponse` and threads `user.role` into `Sidebar` (nav), `Topbar`
 * (breadcrumbs) and `SidebarAccountCard` (avatar, role label); it also carries
 * a dark-mode toggle, nav search, collapsible groups and a `/profile` link. A
 * platform admin has no role, no branch, no photo and no profile page, so
 * reuse would have meant either passing a counterfeit `UserResponse` — which
 * renders an OWNER's tenant nav, links and all — or widening four shared
 * components that every existing tenant route depends on, for a console with
 * three flat destinations. This composes the same `packages/ui` sidebar
 * primitives and the same design tokens instead, so the two shells stay
 * visually identical without the tenant app taking on the risk.
 *
 * No new primitives were added (plan §5, "Pakai ulang packages/ui sepenuhnya").
 */
export function PlatformShell({
  admin,
  children,
}: {
  admin: PlatformAdminResponse;
  children: React.ReactNode;
}) {
  const isMobile = useIsMobile();
  const isRail = useIsRail();

  return (
    <div className="flex min-h-dvh bg-surface-base">
      <SidebarProvider isMobile={isMobile} open={!isRail}>
        <PlatformSidebar admin={admin} />
        <div className="flex min-w-0 flex-1 flex-col">
          <PlatformTopbar />
          <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-5 xl:p-6">
            {children}
          </main>
        </div>
      </SidebarProvider>
    </div>
  );
}

function PlatformTopbar() {
  const { setOpenMobile } = useSidebar();
  return (
    <header
      data-testid="platform-topbar"
      className="flex h-13 shrink-0 items-center justify-between border-b border-border-default bg-surface-raised px-4 md:px-5 xl:px-6"
    >
      <div className="flex items-center gap-3">
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
        <span className="hidden text-xs font-semibold uppercase tracking-widest text-text-tertiary md:inline">
          Konsol Platform
        </span>
      </div>
      {/* A standing reminder of whose screen this is. The console can suspend
          any business in the system, so "which app am I in" should never be a
          question the operator has to stop and answer. */}
      <span className="inline-flex items-center gap-1.5 rounded-xs border border-status-warning/30 bg-status-warning/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-status-warning">
        <ShieldAlert className="size-3.5" aria-hidden />
        Super Admin
      </span>
    </header>
  );
}

function PlatformSidebar({ admin }: { admin: PlatformAdminResponse }) {
  const pathname = usePathname();
  const router = useRouter();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const isRailCollapsed = state === 'collapsed' && !isMobile;
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);
  const [logoutError, setLogoutError] = React.useState<string | null>(null);
  const [passwordOpen, setPasswordOpen] = React.useState(false);

  const closeMobile = () => setOpenMobile(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    setLogoutError(null);
    try {
      await apiFetch('/platform/auth/logout', { method: 'POST' });
      router.push('/platform/login');
      router.refresh();
    } catch {
      setIsLoggingOut(false);
      setLogoutError('Belum berhasil keluar. Periksa koneksi lalu coba lagi.');
    }
  };

  return (
    <SidebarPrimitive
      data-testid="platform-sidebar"
      data-rail={isRailCollapsed || undefined}
      aria-label="Navigasi konsol platform"
    >
      <SidebarHeader
        className={cn(
          'flex h-14 shrink-0 flex-row items-center',
          isRailCollapsed ? 'justify-center' : 'px-3',
        )}
      >
        <Link
          href="/platform"
          onClick={closeMobile}
          aria-label="Konsol Platform OhMyPos"
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

      <SidebarContent className={isRailCollapsed ? 'px-2' : 'px-3'}>
        <SidebarGroup>
          {!isRailCollapsed && <SidebarGroupLabel>Platform</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {PLATFORM_NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                // `/platform` is a prefix of `/platform/tenants`, so the
                // dashboard row would light up on every page under a plain
                // prefix test — the same trap `isNavItemActive`'s comment
                // describes for `/sales` vs `/sales/history`.
                const isActive =
                  item.href === '/platform'
                    ? pathname === '/platform'
                    : isNavItemActive(pathname, item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      tooltip={item.label}
                      data-active={isActive}
                    >
                      <Link
                        href={item.href}
                        onClick={closeMobile}
                        aria-current={isActive ? 'page' : undefined}
                      >
                        {isActive && (
                          <span
                            aria-hidden
                            className="absolute left-0 top-1/2 h-5 w-0.75 -translate-y-1/2 rounded-pill bg-brand-primary"
                          />
                        )}
                        <Icon className="size-4 shrink-0" aria-hidden />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className={isRailCollapsed ? 'px-2' : 'px-3'}>
        <SidebarMenu>
          {/* Account business lives beside "Keluar" rather than behind a third
              nav item: the comment at the top of this file records that a
              platform admin deliberately has no profile page, and one form used
              a few times a year is not a reason to reshape the navigation. */}
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Ganti kata sandi"
              onClick={() => setPasswordOpen(true)}
            >
              <KeyRound className="size-4 shrink-0" aria-hidden />
              <span className="truncate">Ganti kata sandi</span>
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

        <div
          className={cn(
            'flex items-center gap-2.5 rounded-sm bg-surface-muted p-2',
            isRailCollapsed && 'justify-center bg-transparent p-0',
          )}
        >
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-pill border border-brand-primary/20 bg-brand-primary/10 text-xs font-bold text-brand-primary"
          >
            {getInitials(admin.name)}
          </span>
          {!isRailCollapsed && (
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-text-primary">
                {admin.name}
              </p>
              <p className="truncate text-[11px] text-text-tertiary">
                {admin.email}
              </p>
            </div>
          )}
        </div>
      </SidebarFooter>

      <ChangePasswordDialog
        key={String(passwordOpen)}
        open={passwordOpen}
        onOpenChange={setPasswordOpen}
      />
    </SidebarPrimitive>
  );
}
