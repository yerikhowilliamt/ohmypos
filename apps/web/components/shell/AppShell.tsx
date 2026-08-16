import type { UserResponse } from '@ohmypos/api-contracts';
import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppShell({
  user,
  children,
}: {
  user: UserResponse;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-surface-base">
      <Sidebar role={user.role} />
      <div className="flex flex-1 flex-col">
        <Topbar user={user} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
