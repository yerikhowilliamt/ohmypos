'use client';

import * as React from 'react';
import type { UserResponse } from '@ohmypos/api-contracts';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ohmypos/ui/components/popover';
import { cn } from '@ohmypos/ui/lib/utils';

export const ROLE_LABEL: Record<UserResponse['role'], string> = {
  KASIR: 'Kasir',
  ADMIN: 'Admin',
  OWNER: 'Owner',
};

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function Avatar({
  user,
  className,
}: {
  user: UserResponse;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-pill border border-brand-primary/20 bg-brand-primary/10 text-xs font-bold text-brand-primary',
        className,
      )}
    >
      {user.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.photoUrl} alt="" className="size-full object-cover" />
      ) : (
        getInitials(user.name)
      )}
    </span>
  );
}

/**
 * DESIGN.md §16: identity and permission context are always visible, inside
 * their own light-muted rounded container, separated from Settings / Log out.
 * §41.2 collapses it to the avatar alone on the tablet rail, where the name and
 * role move into a popover.
 */
export function SidebarAccountCard({
  user,
  isRail,
}: {
  user: UserResponse;
  isRail: boolean;
}) {
  if (isRail) {
    return (
      <Popover>
        <PopoverTrigger
          data-testid="sidebar-account-trigger"
          aria-label={`Akun ${user.name}`}
          className="mx-auto flex size-10 items-center justify-center rounded-pill outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <Avatar user={user} className="size-8" />
        </PopoverTrigger>
        <PopoverContent side="right" align="end" className="w-56 p-3">
          <p className="truncate text-sm font-semibold text-text-primary">
            {user.name}
          </p>
          <p className="truncate text-xs text-text-tertiary">{user.email}</p>
          <p className="mt-1.5 inline-flex rounded-pill bg-surface-strong px-2 py-0.5 text-xs font-medium text-brand-primary">
            {ROLE_LABEL[user.role]}
          </p>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <div
      data-testid="sidebar-account-card"
      className="mt-1 flex items-center gap-2.5 rounded-md border border-border-default bg-surface-muted p-2"
    >
      <Avatar user={user} className="size-8" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-text-primary">
          {user.name}
        </p>
        <p className="truncate text-xs text-text-tertiary">
          {ROLE_LABEL[user.role]}
        </p>
      </div>
    </div>
  );
}
