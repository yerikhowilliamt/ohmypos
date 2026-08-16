'use client';

import type { UserRole } from '@ohmypos/api-contracts';
import { cn } from '@ohmypos/ui/lib/utils';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getNavItems } from '@/lib/nav-config';

/**
 * Renders only the nav links `role` can reach (System Design §5). This is UX
 * only — RoleGuard/BranchScopeGuard in apps/api are the real enforcement.
 */
export function Sidebar({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const items = getNavItems(role);

  return (
    <aside className="flex w-[216px] shrink-0 flex-col border-r border-border-default bg-surface-raised p-3">
      <div className="px-2 py-3">
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

      <nav className="mt-2 flex flex-col gap-1">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'rounded-sm px-3 py-2 text-sm font-medium text-text-secondary transition-colors',
                active
                  ? 'bg-surface-strong text-brand-primary'
                  : 'hover:bg-surface-strong/60 hover:text-text-primary',
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
