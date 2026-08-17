'use client';

import * as React from 'react';
import type { UserResponse } from '@ohmypos/api-contracts';
import type { ReactNode } from 'react';
import { MobileNavDrawer } from './MobileNavDrawer';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppShell({
  user,
  children,
}: {
  user: UserResponse;
  children: ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

  return (
    <div className="flex min-h-screen bg-surface-base">
      <Sidebar role={user.role} />
      <MobileNavDrawer
        user={user}
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
      />
      <div className="flex flex-1 flex-col min-w-0">
        <Topbar user={user} onOpenMobileNav={() => setMobileNavOpen(true)} />
        <main className="flex-1 p-3.5 sm:p-6 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
