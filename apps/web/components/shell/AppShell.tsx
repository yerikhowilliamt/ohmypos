'use client';

import * as React from 'react';
import type { UserResponse } from '@ohmypos/api-contracts';
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
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

/**
 * DESIGN.md §15. Two shapes of the same shell:
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
}: {
  user: UserResponse;
  children: ReactNode;
  variant?: 'default' | 'pos';
  /** Back-office-only opt-in (System Design §5) — POS and shared routes
   * never pass this, so `data-theme` is never emitted there regardless of
   * what the theme cookie holds. */
  enableDarkMode?: boolean;
  initialTheme?: Theme;
}) {
  const [theme, setTheme] = React.useState<Theme>(initialTheme);
  const [shellEl, setShellEl] = React.useState<HTMLDivElement | null>(null);
  const isPos = variant === 'pos';
  const pathname = usePathname();
  const breadcrumb = getBreadcrumbSegments(pathname, user.role);
  const isMobile = useIsMobile();
  const isRail = useIsRail();

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
                {children}
              </main>
            </div>
          </SidebarProvider>
        </PortalContainerContext.Provider>
      </div>
    </ThemeProvider>
  );
}
