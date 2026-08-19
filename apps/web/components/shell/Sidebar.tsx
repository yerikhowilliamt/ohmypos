'use client';

import * as React from 'react';
import type { UserResponse } from '@ohmypos/api-contracts';
import { cn } from '@ohmypos/ui/lib/utils';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@ohmypos/ui/components/collapsible';
import { ChevronDown, LogOut, Settings } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getNavItems } from '@/lib/nav-config';
import { apiFetch } from '@/lib/api';

const ROLE_LABEL: Record<UserResponse['role'], string> = {
  KASIR: 'Kasir',
  ADMIN: 'Admin',
  OWNER: 'Owner',
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/**
 * Renders only the nav links `role` can reach (System Design §5). This is UX
 * only — RoleGuard/BranchScopeGuard in apps/api are the real enforcement.
 */
export function Sidebar({ user }: { user: UserResponse }) {
  const pathname = usePathname();
  const router = useRouter();
  const items = getNavItems(user.role);
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);

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
    <aside className="hidden md:flex w-[216px] shrink-0 flex-col justify-between border-r border-border-default bg-surface-raised p-3 h-screen sticky top-0">
      <div className="flex flex-col min-h-0">
        <div className="px-2 py-3 shrink-0">
          <Link href="/" className="inline-block">
            <Image
              src="/logo.svg"
              alt="OhMyPos"
              width={142}
              height={40}
              priority
              className="h-8 w-auto object-contain"
            />
          </Link>
        </div>

        <nav className="mt-2 flex flex-col gap-1 overflow-y-auto pr-1">
          {items.map((item) => {
            const hasChildren = item.children && item.children.length > 0;
            const isExactOrSub =
              pathname === item.href || pathname.startsWith(`${item.href}/`);

            if (hasChildren) {
              return (
                <SidebarCollapsibleGroup
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  defaultOpen={isExactOrSub}
                />
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'rounded-sm px-3 py-2 text-sm font-medium transition-colors',
                  isExactOrSub
                    ? 'bg-brand-primary text-white font-semibold shadow-1'
                    : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Sidebar Footer: Settings, Logout, and User Profile */}
      <div className="border-t border-border-default pt-2 mt-auto shrink-0 flex flex-col gap-1">
        {/* Settings button */}
        <Link
          href="/profile"
          className={cn(
            'flex items-center gap-2.5 rounded-sm px-3 py-2 text-sm font-medium transition-colors',
            isSettingsActive
              ? 'bg-brand-primary text-white font-semibold shadow-1'
              : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary',
          )}
        >
          <Settings className="size-4 shrink-0" />
          <span>Pengaturan</span>
        </Link>

        {/* Logout button */}
        <button
          type="button"
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-sm font-medium text-status-danger hover:bg-surface-muted transition-colors disabled:opacity-50 text-left cursor-pointer"
        >
          <LogOut className="size-4 shrink-0" />
          <span>{isLoggingOut ? 'Keluar...' : 'Keluar'}</span>
        </button>

        {/* Static User Profile info */}
        <div className="flex items-center gap-2.5 rounded-md p-2 mt-1 bg-surface-muted/50 border border-border-default/60">
          <div className="size-8 rounded-full bg-brand-primary/10 text-brand-primary border border-brand-primary/20 flex items-center justify-center font-bold text-xs shrink-0">
            {getInitials(user.name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-text-primary truncate">
              {user.name}
            </p>
            <p className="text-[11px] text-text-tertiary truncate">
              {ROLE_LABEL[user.role]}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}

interface SidebarCollapsibleGroupProps {
  item: ReturnType<typeof getNavItems>[number];
  pathname: string;
  defaultOpen: boolean;
}

function SidebarCollapsibleGroup({
  item,
  pathname,
  defaultOpen,
}: SidebarCollapsibleGroupProps) {
  const isExactOrSub =
    pathname === item.href || pathname.startsWith(`${item.href}/`);
  const [isOpenManual, setIsOpenManual] = React.useState<boolean | null>(null);

  const open = isOpenManual ?? (defaultOpen || isExactOrSub);

  return (
    <Collapsible
      open={open}
      onOpenChange={(val) => setIsOpenManual(val)}
      className="flex flex-col gap-0.5"
    >
      <CollapsibleTrigger
        className={cn(
          'group flex w-full items-center justify-between rounded-sm px-3 py-2 text-sm font-medium transition-colors text-left',
          isExactOrSub && !open
            ? 'bg-surface-muted text-brand-primary font-semibold'
            : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary',
        )}
      >
        <span>{item.label}</span>
        <ChevronDown
          className={cn(
            'size-4 text-text-tertiary transition-transform duration-200 group-hover:text-text-primary',
            open && 'rotate-180 text-text-primary',
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-0.5 pl-2 border-l border-border-default ml-3 my-0.5">
        {item.children!.map((child) => {
          const active = pathname === child.href;
          return (
            <Link
              key={child.href}
              href={child.href}
              className={cn(
                'rounded-sm px-3 py-1.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-brand-primary text-white font-semibold shadow-1'
                  : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary',
              )}
            >
              {child.label}
            </Link>
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}
