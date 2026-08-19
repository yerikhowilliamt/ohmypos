import { Button } from '@ohmypos/ui/components/button';
import { Menu } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

interface TopbarProps {
  onOpenMobileNav?: () => void;
}

export function Topbar({ onOpenMobileNav }: TopbarProps) {
  return (
    <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-border-default bg-surface-raised px-4 sm:px-6 md:hidden">
      <div className="flex items-center gap-3">
        {/* Mobile menu button */}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onOpenMobileNav}
          aria-label="Buka menu"
          className="flex size-8 items-center justify-center rounded-xs text-text-secondary hover:bg-surface-muted hover:text-text-primary cursor-pointer"
        >
          <Menu className="size-5" />
        </Button>

        {/* Mobile logo when sidebar is hidden */}
        <Link href="/" className="flex items-center">
          <Image
            src="/logo.svg"
            alt="OhMyPos"
            width={110}
            height={30}
            priority
            className="h-6 w-auto object-contain"
          />
        </Link>
      </div>
    </header>
  );
}
