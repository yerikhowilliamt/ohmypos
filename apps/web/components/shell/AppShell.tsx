'use client';

import * as React from 'react';
import type { UserResponse } from '@ohmypos/api-contracts';
import type { ReactNode } from 'react';
import { cn } from '@ohmypos/ui/lib/utils';
import { MobileNavDrawer } from './MobileNavDrawer';
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
}: {
  user: UserResponse;
  children: ReactNode;
  variant?: 'default' | 'pos';
}) {
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const isPos = variant === 'pos';

  return (
    <div
      className={cn(
        'flex bg-surface-base',
        isPos ? 'h-dvh overflow-hidden' : 'min-h-dvh',
      )}
    >
      <Sidebar user={user} />
      <MobileNavDrawer
        user={user}
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          variant={variant}
          onOpenMobileNav={() => setMobileNavOpen(true)}
        />
        <main
          className={cn(
            'min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-5 xl:p-6',
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
