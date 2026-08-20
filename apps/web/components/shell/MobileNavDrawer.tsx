'use client';

import * as React from 'react';
import type { UserResponse } from '@ohmypos/api-contracts';
import { cn } from '@ohmypos/ui/lib/utils';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@ohmypos/ui/components/collapsible';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@ohmypos/ui/components/sheet';
import { ChevronDown } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getNavItems, isNavItemActive, type NavItem } from '@/lib/nav-config';
import { ROLE_LABEL } from './SidebarAccountCard';
import { LogoutButton } from './LogoutButton';

interface MobileNavDrawerProps {
  user: UserResponse;
  open: boolean;
  onClose: () => void;
}

export function MobileNavDrawer({ user, open, onClose }: MobileNavDrawerProps) {
  const pathname = usePathname();
  const items = getNavItems(user.role);

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent
        side="left"
        className="p-4 flex flex-col justify-between h-full"
      >
        <div>
          {/* Header */}
          <SheetHeader className="border-b border-border-default pb-3">
            <SheetTitle className="sr-only">Navigasi OhMyPos</SheetTitle>
            <Link href="/" onClick={onClose} className="inline-block">
              <Image
                src="/logo.svg"
                alt="OhMyPos"
                width={130}
                height={36}
                priority
                className="h-7 w-auto object-contain"
              />
            </Link>
          </SheetHeader>

          {/* User Badge */}
          <div className="my-3 rounded-sm bg-surface-muted p-2.5">
            <p className="text-xs font-semibold text-text-primary truncate">
              {user.name}
            </p>
            <p className="text-[11px] text-text-tertiary">
              {user.email} •{' '}
              <span className="font-medium text-brand-primary">
                {ROLE_LABEL[user.role]}
              </span>
            </p>
          </div>

          {/* Nav Links */}
          <nav className="flex flex-col gap-1 overflow-y-auto max-h-[calc(100vh-220px)]">
            {items.map((item) => {
              const hasChildren = item.children && item.children.length > 0;
              const isExactOrSub = isNavItemActive(pathname, item.href);

              if (hasChildren) {
                return (
                  <MobileCollapsibleGroup
                    key={item.href}
                    item={item}
                    pathname={pathname}
                    onClose={onClose}
                    defaultOpen={isExactOrSub}
                  />
                );
              }

              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  aria-current={isExactOrSub ? 'page' : undefined}
                  className={cn(
                    'flex min-h-11 items-center gap-2.5 rounded-sm px-3 text-sm font-medium transition-colors',
                    isExactOrSub
                      ? 'bg-surface-strong font-semibold text-brand-primary'
                      : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary',
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Footer with Logout */}
        <div className="border-t border-border-default pt-3 mt-auto">
          <LogoutButton />
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface MobileCollapsibleGroupProps {
  item: NavItem;
  pathname: string;
  onClose: () => void;
  defaultOpen: boolean;
}

function MobileCollapsibleGroup({
  item,
  pathname,
  onClose,
  defaultOpen,
}: MobileCollapsibleGroupProps) {
  const isExactOrSub = isNavItemActive(pathname, item.href);
  const [isOpenManual, setIsOpenManual] = React.useState<boolean | null>(null);

  const open = isOpenManual ?? (defaultOpen || isExactOrSub);

  return (
    <Collapsible
      open={open}
      onOpenChange={(val) => setIsOpenManual(val)}
      className="flex flex-col gap-0.5 mt-1"
    >
      <CollapsibleTrigger
        className={cn(
          'group flex min-h-11 w-full items-center gap-2.5 rounded-sm px-3 text-left text-sm font-medium transition-colors',
          isExactOrSub && !open
            ? 'bg-surface-strong font-semibold text-brand-primary'
            : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary',
        )}
      >
        <item.icon className="size-4 shrink-0" aria-hidden />
        <span className="truncate">{item.label}</span>
        <ChevronDown
          aria-hidden
          className={cn(
            'ml-auto size-4 shrink-0 text-text-tertiary transition-transform duration-200',
            open && 'rotate-180 text-text-primary',
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-1 pl-2 border-l border-border-default ml-3 my-0.5">
        {item.children!.map((child) => {
          const active = pathname === child.href;
          return (
            <Link
              key={child.href}
              href={child.href}
              onClick={onClose}
              className={cn(
                'rounded-sm px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-surface-strong font-semibold text-brand-primary'
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
