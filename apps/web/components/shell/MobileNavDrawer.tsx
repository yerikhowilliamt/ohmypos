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
import { getNavItems } from '@/lib/nav-config';
import { LogoutButton } from './LogoutButton';

interface MobileNavDrawerProps {
  user: UserResponse;
  open: boolean;
  onClose: () => void;
}

const ROLE_LABEL: Record<UserResponse['role'], string> = {
  KASIR: 'Kasir',
  ADMIN: 'Admin',
  OWNER: 'Owner',
};

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
              const isExactOrSub =
                pathname === item.href || pathname.startsWith(`${item.href}/`);

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

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    'rounded-sm px-3 py-2.5 text-sm font-medium transition-colors',
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

        {/* Footer with Logout */}
        <div className="border-t border-border-default pt-3 mt-auto">
          <LogoutButton />
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface MobileCollapsibleGroupProps {
  item: ReturnType<typeof getNavItems>[number];
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
  const isExactOrSub =
    pathname === item.href || pathname.startsWith(`${item.href}/`);
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
          'group flex w-full items-center justify-between rounded-sm px-3 py-2.5 text-sm font-medium transition-colors text-left',
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
