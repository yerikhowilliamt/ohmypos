'use client';

import * as React from 'react';
import type { SessionResponse } from '@ohmypos/api-contracts';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { SidebarProvider } from '@ohmypos/ui/components/sidebar';
import { cn } from '@ohmypos/ui/lib/utils';
import { PortalContainerContext } from '@ohmypos/ui/lib/portal-container';
import { useIsMobile, useIsRail } from '@/hooks/useMediaQuery';
import { getBreadcrumbSegments } from '@/lib/nav-config';
import { persistThemeCookie } from '@/lib/theme-client';
import type { Theme } from '@/lib/theme';
import { ThemeProvider } from '@/lib/theme-context';
import { ImpersonationBanner } from '@/components/platform/ImpersonationBanner';
import { Sidebar } from './Sidebar';
import { SuspendedTenantDialog } from './SuspendedTenantDialog';
import { Topbar } from './Topbar';

/**
 * DESIGN.md §10 Application Shell & Navigation. Two shapes of the same shell:
 *
 * - `default` (Backoffice + shared routes): 52px topbar, page scrolls normally.
 * - `pos`: no desktop topbar strip, and the shell is exactly one viewport tall
 *   so the three POS zones can size themselves against it instead of growing
 *   the page. `<main>` still scrolls internally, which is what keeps
 *   `/sales/history` — an ordinary table page inside the same route group —
 *   working unchanged.
 *
 * Page margins follow §41.6's step-down: 16px mobile, 24px tablet, 32px desktop.
 */
export function AppShell({
  user,
  children,
  variant = 'default',
  enableDarkMode = false,
  initialTheme = 'light',
  impersonatedLabel = null,
}: {
  user: SessionResponse;
  children: ReactNode;
  variant?: 'default' | 'pos';
  /** Back-office-only opt-in (System Design §5) — POS and shared routes
   * never pass this, so `data-theme` is never emitted there regardless of
   * what the theme cookie holds. */
  enableDarkMode?: boolean;
  initialTheme?: Theme;
  /**
   * ADR-025 Decision 8 — non-null while a platform operator is browsing this
   * tenant as its OWNER. Read from a cookie by the route-group layouts, so a
   * layout that does not pass it simply never shows the banner rather than
   * showing a wrong one.
   */
  impersonatedLabel?: string | null;
}) {
  const [theme, setTheme] = React.useState<Theme>(initialTheme);
  const [shellEl, setShellEl] = React.useState<HTMLDivElement | null>(null);
  const isPos = variant === 'pos';
  const pathname = usePathname();
  const breadcrumb = getBreadcrumbSegments(pathname, user.role);
  const isMobile = useIsMobile();
  const isRail = useIsRail();
  /**
   * TASK-132 — when the business is suspended, the shell renders but the page
   * does not. `children` is server-rendered output whose client components only
   * fetch once they MOUNT, so leaving them out of the tree is what keeps a
   * dozen 403s from piling up behind a modal that already explains the one
   * reason for all of them.
   *
   * The chrome stays: the point is that the owner has arrived inside the
   * application and is being told why it is empty, rather than being bounced
   * back to a login screen that accepts their password and asks again.
   *
   * An impersonating operator is excluded, and that exclusion is the whole
   * reason ADR-025 Decision 8 exempts impersonation from `TenantStatusGuard`:
   * the most likely reason to open a suspended tenant's books is to work out
   * why it was suspended, and a modal covering them would undo the exemption
   * from the frontend.
   */
  const isTenantSuspended =
    user.tenantStatus === 'SUSPENDED' && !impersonatedLabel;

  const toggleTheme = React.useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      persistThemeCookie(next);
      return next;
    });
  }, []);

  return (
    <ThemeProvider
      theme={theme}
      toggleTheme={toggleTheme}
      enableDarkMode={enableDarkMode}
    >
      <div
        ref={setShellEl}
        data-theme={enableDarkMode ? theme : undefined}
        className={cn(
          'flex bg-surface-base',
          enableDarkMode && theme === 'dark' && 'dark',
          isPos ? 'h-dvh overflow-hidden' : 'min-h-dvh',
        )}
      >
        <PortalContainerContext.Provider
          value={enableDarkMode ? shellEl : null}
        >
          <SidebarProvider isMobile={isMobile} open={!isRail}>
            <Sidebar user={user} />
            <div className="flex min-w-0 flex-1 flex-col">
              {impersonatedLabel && (
                <ImpersonationBanner label={impersonatedLabel} />
              )}
              <Topbar
                variant={variant}
                breadcrumb={breadcrumb}
                enableDarkMode={enableDarkMode}
                theme={theme}
                onToggleTheme={toggleTheme}
              />
              <main
                className={cn(
                  'min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-5 xl:p-6',
                )}
              >
                {isTenantSuspended ? <SuspendedTenantNotice /> : children}
              </main>
            </div>
            {isTenantSuspended && <SuspendedTenantDialog />}
          </SidebarProvider>
        </PortalContainerContext.Provider>
      </div>
    </ThemeProvider>
  );
}

/**
 * What sits under the suspension modal. Not a spinner and not an error: nothing
 * is loading and nothing failed, so it says the same thing the modal says, in
 * one line, for the moment after the modal is read.
 */
function SuspendedTenantNotice() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <p className="max-w-sm text-center text-sm text-text-tertiary">
        Halaman tidak dimuat selama bisnis ini ditangguhkan.
      </p>
    </div>
  );
}
