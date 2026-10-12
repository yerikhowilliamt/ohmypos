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
 * App shell (DESIGN.md §10). `default` has a topbar and a scrolling page; `pos`
 * is exactly one viewport tall so the POS zones size against it.
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
  /** Back-office only; enables `data-theme`. */
  enableDarkMode?: boolean;
  initialTheme?: Theme;
  /** Set while a platform operator impersonates this tenant; shows the banner. */
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
   * The tenant is suspended: render the shell and the explanation, but not the
   * page (its components would only fire 403s). Ignored while impersonating.
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

/** Placeholder under the suspension modal, repeating its message in one line. */
function SuspendedTenantNotice() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <p className="max-w-sm text-center text-sm text-text-tertiary">
        Halaman tidak dimuat selama bisnis ini ditangguhkan.
      </p>
    </div>
  );
}
