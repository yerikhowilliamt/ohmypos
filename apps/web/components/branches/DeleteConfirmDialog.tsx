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

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  itemName?: string;
  isDeleting?: boolean;
  errorMessage?: string | null;
  onConfirm: () => void;
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  itemName,
  isDeleting = false,
  errorMessage,
  onConfirm,
}: DeleteConfirmDialogProps) {
  // Override internal generic description logic if specific text is requested
  const displayDescription =
    description === 'Tindakan ini tidak bisa dibatalkan.'
      ? 'Cabang yang dihapus tidak dapat dipulihkan. Pastikan tidak ada transaksi aktif di cabang ini.'
      : description;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-status-danger">{title}</DialogTitle>
          <DialogDescription className="mt-2 text-text-secondary">
            {displayDescription}
            {itemName && (
              <span className="block mt-2 font-medium text-text-primary">
                &quot;{itemName}&quot;
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
            disabled={isDeleting}
            onClick={() => onOpenChange(false)}
          >
            Batal
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isDeleting}
            onClick={onConfirm}
          >
            {isDeleting ? 'Menghapus…' : 'Hapus'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
