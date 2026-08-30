'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Eye } from 'lucide-react';
import { Button } from '@ohmypos/ui/components/button';

/**
 * ADR-025 Decision 8 — shown across the whole tenant app while a platform
 * operator is looking through an OWNER's account.
 *
 * Permanent and undismissable on purpose. The session is read-only, so the
 * failure it guards against is not a destructive click — the API refuses those
 * — but the operator forgetting whose numbers are on screen and reporting them
 * as another tenant's, or as their own. A dismissable banner is exactly the one
 * that gets dismissed in the first minute.
 *
 * "Keluar" clears the cookies and returns to the console. It cannot revoke the
 * token: there is no revocation list for impersonation tokens, and the JWT
 * stays valid on the API until its 30 minutes run out (TASK-126). Discarding
 * the credential IS the exit, which is why the button never claims more.
 */
export function ImpersonationBanner({ label }: { label: string }) {
  const router = useRouter();
  const [isLeaving, setIsLeaving] = React.useState(false);

  const leave = async () => {
    setIsLeaving(true);
    try {
      await fetch('/api/platform/impersonation', { method: 'DELETE' });
    } catch {
      // Swallowed on purpose, and caught rather than left to `finally`: an
      // unhandled rejection here would surface as a console error on a path
      // that is already handled. Sending the operator back to the console
      // matters more than the cookie clear succeeding — leaving them inside a
      // tenant believing they left is the worse of the two outcomes.
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
