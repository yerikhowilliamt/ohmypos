'use client';

import { Button } from '@ohmypos/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ohmypos/ui/components/dialog';

interface DeleteMyAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isSubmitting?: boolean;
  errorMessage?: string | null;
  onConfirm: () => void;
}

/**
 * Labeled "Hapus" per the user-facing request, but calls
 * `PATCH /auth/deactivate` under the hood — soft-deactivate only, same rule as
 * `apps/web/components/users/DeactivateConfirmDialog.tsx` (ERD §7 note 3).
 */
export function DeleteMyAccountDialog({
  open,
  onOpenChange,
  isSubmitting = false,
  errorMessage,
  onConfirm,
}: DeleteMyAccountDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-status-danger">
            Hapus Akun Saya
          </DialogTitle>
          <DialogDescription className="mt-2 text-text-secondary">
            Akun Anda akan dihapus secara permanen dari sistem. Tindakan ini
            tidak dapat dibatalkan.
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
            {isSubmitting ? 'Menghapus…' : 'Hapus Akun Saya'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
