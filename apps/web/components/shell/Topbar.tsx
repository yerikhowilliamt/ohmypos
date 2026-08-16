import type { UserResponse } from '@ohmypos/api-contracts';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ohmypos/ui/components/dropdown-menu';
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

export function Topbar({ user }: { user: UserResponse }) {
  return (
    <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-border-default bg-surface-raised px-6">
      <span className="text-sm font-medium text-text-secondary">
        {branchLabel(user)}
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 rounded-sm px-2 py-1 text-sm font-medium text-text-primary hover:bg-surface-strong/60">
          <span>{user.name}</span>
          <span className="text-xs text-text-tertiary">
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
