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
 * Shown to a suspended tenant's users (TASK-132). Not dismissable: everything
 * behind it is refused by the API, and logout is the one action that works.
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
