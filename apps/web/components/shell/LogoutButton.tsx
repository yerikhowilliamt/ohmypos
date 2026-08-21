'use client';

import { Button } from '@ohmypos/ui/components/button';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';

/**
 * Only redirects on a successful logout — the proxy only checks for the
 * presence of the `access_token` cookie, not its validity, so redirecting to
 * `/login` while the cookie is still set (e.g. on a network error) would just
 * bounce the user straight back into the app.
 */
export function LogoutButton() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogout = async () => {
    setIsPending(true);
    setError(null);
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal keluar');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="px-1 py-0.5">
      <Button
        type="button"
        variant="ghost"
        onClick={handleLogout}
        disabled={isPending}
        className="w-full justify-start rounded-sm px-2 py-1.5 text-left text-sm font-medium text-status-danger hover:bg-surface-strong/60 disabled:opacity-50"
      >
        {isPending ? 'Keluar…' : 'Keluar'}
      </Button>
      {error && (
        <p role="alert" className="mt-1 px-2 text-xs text-status-danger">
          {error}
        </p>
      )}
    </div>
  );
}
