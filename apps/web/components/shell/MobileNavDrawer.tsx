'use client';

import * as React from 'react';
import type { UserResponse } from '@ohmypos/api-contracts';
import { cn } from '@ohmypos/ui/lib/utils';
import { Button } from '@ohmypos/ui/components/button';
import { X } from 'lucide-react';
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

  // Close drawer on ESC key
  React.useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Lock body scroll when drawer is open
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 md:hidden"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop overlay */}
      <div
        className="fixed inset-0 bg-surface-dark/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer content */}
      <div className="fixed inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col border-r border-border-default bg-surface-raised p-4 shadow-2 animate-in slide-in-from-left duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-default pb-3">
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
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Tutup navigasi"
            className="flex size-8 items-center justify-center rounded-xs text-text-secondary hover:bg-surface-muted hover:text-text-primary"
          >
            <X className="size-5" />
          </Button>
        </div>

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
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
          {items.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  'rounded-sm px-3 py-2.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-brand-primary text-white font-semibold shadow-1'
                    : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer with Logout */}
        <div className="border-t border-border-default pt-3">
          <LogoutButton />
        </div>
      </div>
    </div>
  );
}
