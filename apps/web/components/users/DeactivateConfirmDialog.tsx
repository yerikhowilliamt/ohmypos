'use client';

import * as React from 'react';
import { Button } from '@ohmypos/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ohmypos/ui/components/dialog';

interface DeactivateConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userName?: string;
  isSubmitting?: boolean;
  errorMessage?: string | null;
  onConfirm: () => void;
}

/**
 * Labeled "Hapus" per the user-facing request, but calls
 * `PATCH /users/:id/deactivate` under the hood — `Sale.userId` is an audit
 * trail that must survive a staff member leaving (ADR-011, ERD §7 note 3),
 * so there is no hard-delete endpoint to call here.
 */
export function DeactivateConfirmDialog({
  open,
  onOpenChange,
  userName,
  isSubmitting = false,
  errorMessage,
  onConfirm,
}: DeactivateConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-status-danger">
            Hapus Pengguna
          </DialogTitle>
          <DialogDescription className="mt-2 text-text-secondary">
            Pengguna ini tidak akan bisa login lagi dan akan langsung keluar
            dari sesi aktifnya. Riwayat transaksi yang tercatat atas namanya
            tetap tersimpan.
            {userName && (
              <span className="block mt-2 font-medium text-text-primary">
                &quot;{userName}&quot;
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {errorMessage && (
          <div
            role="alert"
            className="rounded-sm border border-status-danger/30 bg-status-danger/10 p-3 text-xs text-status-danger"
          >
            {errorMessage}
          </div>
        )}

        <DialogFooter className="mt-4 gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            onClick={() => onOpenChange(false)}
          >
            Batal
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isSubmitting}
            onClick={onConfirm}
          >
            {isSubmitting ? 'Menghapus…' : 'Hapus'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
