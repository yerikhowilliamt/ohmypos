'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Eye } from 'lucide-react';
import { Button } from '@ohmypos/ui/components/button';

/**
 * Permanent, undismissable banner while impersonating (ADR-025 Decision 8).
 * "Keluar" discards the cookies; the token itself cannot be revoked.
 */
export function ImpersonationBanner({ label }: { label: string }) {
  const router = useRouter();
  const [isLeaving, setIsLeaving] = React.useState(false);

  const leave = async () => {
    setIsLeaving(true);
    try {
      await fetch('/api/platform/impersonation', { method: 'DELETE' });
    } catch {
      // Swallowed: returning the operator to the console matters more than the cookie clear.
    }
    router.push('/platform');
    router.refresh();
  };

  return (
    <div
      role="status"
      data-testid="impersonation-banner"
      className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-status-warning/30 bg-status-warning/10 px-4 py-2 md:px-5 xl:px-6"
    >
      <p className="flex items-center gap-2 text-xs text-text-primary">
        <Eye className="size-4 shrink-0 text-status-warning" aria-hidden />
        <span>
          Mode impersonasi — Anda melihat data{' '}
          <strong className="font-semibold">{label}</strong> sebagai Owner.
          Hanya bisa membaca; semua perubahan ditolak.
        </span>
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={leave}
        disabled={isLeaving}
        className="h-8 border-status-warning/40 text-xs"
      >
        {isLeaving ? 'Keluar…' : 'Keluar dari mode ini'}
      </Button>
    </div>
  );
}
