'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@ohmypos/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ohmypos/ui/components/dialog';
import { PauseCircle } from 'lucide-react';
import { apiFetch } from '@/lib/api';

/**
 * TASK-132 — what a suspended tenant's user sees.
 *
 * Before this existed, a suspended business could log in and was then bounced
 * straight back to the login screen by every page, because `GET /auth/me`
 * answered 403 and `getSession()` cannot tell that apart from "not signed in".
 * The owner saw a login form that accepted their password and then asked for it
 * again — with no statement anywhere that the business had been switched off.
 *
 * Deliberately not dismissable: no close button, no click-outside, no Escape.
 * Nothing behind it works — `TenantStatusGuard` rejects every endpoint except
 * logout and `/auth/me` — so a modal that could be dismissed would only leave
 * the reader looking at an application that silently refuses everything. The
 * one action is the one action that still functions.
 */
export function SuspendedTenantDialog() {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    setError(null);
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch {
      setIsLoggingOut(false);
      setError('Belum berhasil keluar. Periksa koneksi lalu coba lagi.');
    }
  };

  return (
    <Dialog open>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <div
            className="mb-2 flex size-10 items-center justify-center rounded-full bg-status-warning/15 text-status-warning"
            aria-hidden
          >
            <PauseCircle className="size-5" />
          </div>
          <DialogTitle>Akses bisnis ini sedang ditangguhkan</DialogTitle>
          <DialogDescription>
            Akun Anda benar dan Anda berhasil masuk — yang ditangguhkan adalah
            bisnisnya, bukan akun Anda. Selama penangguhan berlaku, tidak ada
            data yang bisa dibuka atau disimpan.
          </DialogDescription>
        </DialogHeader>

        <p className="rounded-sm border border-border-default bg-surface-muted p-3 text-xs text-text-secondary">
          Hubungi admin OhMyPos untuk membuka penangguhan. Data bisnis Anda
          tetap utuh dan akan kembali seperti semula begitu penangguhan dicabut.
        </p>

        <DialogFooter>
          <Button type="button" onClick={handleLogout} disabled={isLoggingOut}>
            {isLoggingOut ? 'Keluar…' : 'Keluar'}
          </Button>
        </DialogFooter>

        {error && (
          <p role="alert" className="text-xs font-medium text-status-danger">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
