'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PlatformAdminChangePasswordSchema } from '@ohmypos/api-contracts';
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
import { usePlatformChangePassword } from '@/hooks/usePlatformAuth';

/**
 * The confirmation field is added here rather than in the shared contract,
 * exactly as `PasswordForm` in `app/(shared)/profile/ProfileClient.tsx` does:
 * it is a typo guard for one form, not part of the request the API validates.
 */
const FormSchema = PlatformAdminChangePasswordSchema.extend({
  confirmPassword: z.string().min(1, 'Konfirmasi kata sandi wajib diisi'),
}).refine((v) => v.newPassword === v.confirmPassword, {
  message: 'Konfirmasi kata sandi tidak cocok',
  path: ['confirmPassword'],
});

type FormValues = z.infer<typeof FormSchema>;

export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const changePassword = usePlatformChangePassword();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { oldPassword: '', newPassword: '', confirmPassword: '' },
  });

  // No reset-on-open effect — the shell keys this component on `open`, so each
  // opening mounts a fresh one. See the note in `users/ResetPasswordDialog`.

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      await changePassword.mutateAsync({
        oldPassword: values.oldPassword,
        newPassword: values.newPassword,
      });
      // The server bumped `tokenValidFrom`, so this session is already dead —
      // closing the dialog and staying put would make the next request 401 in
      // a way that looks like a bug. Go to the login page deliberately.
      reset({ oldPassword: '', newPassword: '', confirmPassword: '' });
      onOpenChange(false);
      router.push('/platform/login');
      router.refresh();
    } catch (error) {
      setServerError(
        error instanceof Error
          ? error.message
          : 'Kata sandi belum berubah. Periksa koneksi lalu coba lagi.',
      );
    }
  };

  const isPending = isSubmitting || changePassword.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Ganti kata sandi</DialogTitle>
          <DialogDescription>
            Minimal 12 karakter. Setelah tersimpan, Anda keluar dari semua
            perangkat dan harus masuk kembali.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="platform-old-password">Kata sandi saat ini</Label>
            <PasswordInput
              id="platform-old-password"
              autoComplete="current-password"
              aria-invalid={Boolean(errors.oldPassword)}
              {...register('oldPassword')}
            />
            {errors.oldPassword && (
              <p role="alert" className="text-xs text-status-danger">
                {errors.oldPassword.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="platform-new-password">Kata sandi baru</Label>
            <PasswordInput
              id="platform-new-password"
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
            <Label htmlFor="platform-confirm-password">
              Konfirmasi kata sandi baru
            </Label>
            <PasswordInput
              id="platform-confirm-password"
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
              {isPending ? 'Menyimpan…' : 'Simpan & keluar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
