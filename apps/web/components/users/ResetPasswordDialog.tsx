'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ResetUserPasswordSchema,
  type UserResponse,
} from '@ohmypos/api-contracts';
import { Button } from '@ohmypos/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ohmypos/ui/components/dialog';
import { Label } from '@ohmypos/ui/components/label';
import { PasswordInput } from '@ohmypos/ui/components/password-input';
import { useResetUserPassword } from '@/hooks/useUsers';

/**
 * TASK-130 — an OWNER setting a staff member's password when they have
 * forgotten it. There is no "current password" field on purpose: the OWNER does
 * not know it, and that is the whole reason this dialog exists.
 */
const FormSchema = ResetUserPasswordSchema.extend({
  confirmPassword: z.string().min(1, 'Konfirmasi kata sandi wajib diisi'),
}).refine((v) => v.newPassword === v.confirmPassword, {
  message: 'Konfirmasi kata sandi tidak cocok',
  path: ['confirmPassword'],
});

type FormValues = z.infer<typeof FormSchema>;

export function ResetPasswordDialog({
  user,
  onOpenChange,
}: {
  user: UserResponse | null;
  onOpenChange: (open: boolean) => void;
}) {
  const resetPassword = useResetUserPassword();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(
    null,
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  // No reset-on-open effect: the parent keys this component on the selected
  // user, so opening the dialog mounts a fresh one with fresh defaults. That
  // is both simpler and the only way a typed password is guaranteed not to
  // survive a close (`react-hooks/set-state-in-effect` rejects the effect
  // version, and it is right to).
  const open = Boolean(user);

  const onSubmit = async (values: FormValues) => {
    if (!user) return;
    setServerError(null);
    try {
      const result = await resetPassword.mutateAsync({
        id: user.id,
        newPassword: values.newPassword,
      });
      // Cleared the moment the request succeeds: after this point the typed
      // password has no reason to exist anywhere in the client, and the dialog
      // deliberately never shows it again.
      reset({ newPassword: '', confirmPassword: '' });
      setSuccessMessage(result.message);
    } catch (error) {
      setServerError(
        error instanceof Error
          ? error.message
          : 'Kata sandi belum direset. Periksa koneksi lalu coba lagi.',
      );
    }
  };

  const isPending = isSubmitting || resetPassword.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>
            Reset kata sandi — {user?.name ?? 'Pengguna'}
          </DialogTitle>
          <DialogDescription>
            {/* Said before the button is pressed, not after. A cashier suddenly
                thrown out mid-queue is a surprise one sentence can prevent. */}
            Karyawan ini akan langsung keluar dari semua perangkat dan harus
            masuk lagi dengan kata sandi baru. Minimal 8 karakter.
          </DialogDescription>
        </DialogHeader>

        {successMessage ? (
          <div className="space-y-4">
            <p
              role="status"
              className="rounded-sm border border-status-success/30 bg-status-success/10 p-3 text-xs font-medium text-text-primary"
            >
              {successMessage}
            </p>
            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange(false)}>
                Tutup
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="reset-user-password">Kata sandi baru</Label>
              <PasswordInput
                id="reset-user-password"
                autoComplete="new-password"
                aria-invalid={Boolean(errors.newPassword)}
                {...register('newPassword')}
              />
              {errors.newPassword && (
                <p role="alert" className="text-xs text-status-danger">
                  {errors.newPassword.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reset-user-confirm">
                Konfirmasi kata sandi baru
              </Label>
              <PasswordInput
                id="reset-user-confirm"
                autoComplete="new-password"
                aria-invalid={Boolean(errors.confirmPassword)}
                {...register('confirmPassword')}
              />
              {errors.confirmPassword && (
                <p role="alert" className="text-xs text-status-danger">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>

            {serverError && (
              <p
                role="alert"
                className="rounded-sm border border-status-danger/30 bg-status-danger/10 p-3 text-xs font-medium text-status-danger"
              >
                {serverError}
              </p>
            )}

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => onOpenChange(false)}
              >
                Batal
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Menyimpan…' : 'Reset kata sandi'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
