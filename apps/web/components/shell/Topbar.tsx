import type { UserResponse } from '@ohmypos/api-contracts';
import { Button } from '@ohmypos/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ohmypos/ui/components/dropdown-menu';
import { Menu } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { LogoutButton } from './LogoutButton';

const ROLE_LABEL: Record<UserResponse['role'], string> = {
  KASIR: 'Kasir',
  ADMIN: 'Admin',
  OWNER: 'Owner',
};

/**
 * Owner/Admin see "Semua Cabang" — stock and cash are centralized pools with
 * no per-branch balance (ADR-004), so there's nothing for a branch selector
 * to filter yet. Kasir gets a fixed, non-interactive branch label
 * (DESIGN.md §17) — never a branch-switch control.
 */
function branchLabel(user: UserResponse): string {
  return user.role === 'KASIR' ? 'Cabang Terkunci' : 'Semua Cabang';
}

interface TopbarProps {
  user: UserResponse;
  onOpenMobileNav?: () => void;
}

export function Topbar({ user, onOpenMobileNav }: TopbarProps) {
  return (
    <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-border-default bg-surface-raised px-4 sm:px-6">
      <div className="flex items-center gap-3">
        {/* Mobile menu button */}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onOpenMobileNav}
          aria-label="Buka menu"
          className="flex size-8 items-center justify-center rounded-xs text-text-secondary hover:bg-surface-muted hover:text-text-primary md:hidden cursor-pointer"
        >
          <Menu className="size-5" />
        </Button>

        {/* Mobile logo when sidebar is hidden */}
        <Link href="/" className="flex items-center md:hidden">
          <Image
            src="/logo.svg"
            alt="OhMyPos"
            width={110}
            height={30}
            priority
            className="h-6 w-auto object-contain"
          />
        </Link>

        {/* Desktop / tablet branch label */}
        <span className="hidden text-sm font-medium text-text-secondary sm:inline-block">
          {branchLabel(user)}
        </span>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 rounded-sm px-2 py-1 text-sm font-medium text-text-primary hover:bg-surface-strong/60 cursor-pointer min-w-0">
          <span className="truncate max-w-[90px] sm:max-w-[200px]">
            {user.name}
          </span>
          <span className="shrink-0 text-xs text-text-tertiary">
            {ROLE_LABEL[user.role]}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <LogoutButton />
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
