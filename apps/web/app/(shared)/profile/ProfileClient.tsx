'use client';

import * as React from 'react';
import Image from 'next/image';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { UpdateSelfSchema, ChangePasswordSchema } from '@ohmypos/api-contracts';
import { Button } from '@ohmypos/ui/components/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@ohmypos/ui/components/card';
import { Input } from '@ohmypos/ui/components/input';
import { PasswordInput } from '@ohmypos/ui/components/password-input';
import { Label } from '@ohmypos/ui/components/label';
import { useRouter } from 'next/navigation';
import {
  useChangePassword,
  useCurrentUser,
  useDeactivateSelf,
  useUpdateProfile,
  useUploadPhoto,
} from '@/hooks/useProfile';
import { DeleteMyAccountDialog } from './DeleteMyAccountDialog';

const ROLE_LABELS = { KASIR: 'Kasir', ADMIN: 'Admin', OWNER: 'Owner' } as const;

function safeImageSrc(src: string | null): string | null {
  if (!src) return null;
  try {
    const url = new URL(src);
    if (
      url.protocol === 'blob:' ||
      url.protocol === 'https:' ||
      url.protocol === 'http:'
    ) {
      return src;
    }
    if (url.protocol === 'data:') {
      const mimeMatch = src.match(/^data:([^;,]+)/);
      if (mimeMatch && mimeMatch[1]?.startsWith('image/')) return src;
    }
  } catch {
    if (src.startsWith('/')) return src;
  }
  return null;
}

export function ProfileClient() {
  const router = useRouter();
  const { data: user, isLoading } = useCurrentUser();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Profil Saya
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Perbarui informasi profil dan kata sandi akun Anda.
        </p>
      </div>

      {isLoading || !user ? (
        <p className="text-sm text-text-tertiary">Memuat…</p>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Akun</CardTitle>
              <CardDescription>
                {user.email} · {ROLE_LABELS[user.role]}
              </CardDescription>
            </CardHeader>
          </Card>

          <PhotoForm currentPhotoUrl={user.photoUrl} />
          <NameForm currentName={user.name} onSaved={() => router.refresh()} />
          <PasswordForm />
          <DangerZone />
        </>
      )}
    </div>
  );
}

function PhotoForm({ currentPhotoUrl }: { currentPhotoUrl: string | null }) {
  const router = useRouter();
  const uploadMutation = useUploadPhoto();
  const [localPreview, setLocalPreview] = React.useState<string | null>(null);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const displayPhoto = safeImageSrc(localPreview ?? currentPhotoUrl);

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setServerError(null);
    const objectUrl = URL.createObjectURL(file);
    setLocalPreview(objectUrl);

    try {
      await uploadMutation.mutateAsync(file);
      setLocalPreview(null);
      router.refresh();
    } catch (error) {
      setLocalPreview(null);
      setServerError(
        error instanceof Error
          ? error.message
          : 'Foto belum terunggah. Periksa koneksi lalu coba lagi.',
      );
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Foto Profil</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center gap-4">
        <div className="size-16 shrink-0 overflow-hidden rounded-full bg-surface-muted">
          {displayPhoto ? (
            <Image
              src={displayPhoto}
              alt="Foto profil"
              width={64}
              height={64}
              unoptimized
              className="size-full object-cover"
            />
          ) : null}
        </div>
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            type="button"
            variant="outline"
            disabled={uploadMutation.isPending}
            onClick={() => inputRef.current?.click()}
          >
            {uploadMutation.isPending ? 'Mengunggah…' : 'Ganti Foto'}
          </Button>
          {serverError && (
            <p role="alert" className="mt-1 text-xs text-status-danger">
              {serverError}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function NameForm({
  currentName,
  onSaved,
}: {
  currentName: string;
  onSaved: () => void;
}) {
  const updateMutation = useUpdateProfile();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(UpdateSelfSchema),
    defaultValues: { name: currentName },
  });

  const onSubmit = async (values: { name: string }) => {
    setServerError(null);
    setSaved(false);
    try {
      await updateMutation.mutateAsync(values);
      setSaved(true);
      onSaved();
    } catch (error) {
      setServerError(
        error instanceof Error
          ? error.message
          : 'Nama belum tersimpan. Periksa koneksi lalu coba lagi.',
      );
    }
  };

  const isPending = isSubmitting || updateMutation.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ubah Nama</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <Label htmlFor="profile-name">Nama</Label>
            <Input
              id="profile-name"
              autoComplete="off"
              aria-invalid={Boolean(errors.name)}
              {...register('name')}
            />
            {errors.name && (
              <p role="alert" className="text-xs text-status-danger">
                {errors.name.message}
              </p>
            )}
          </div>
          {serverError && (
            <p role="alert" className="text-xs text-status-danger">
              {serverError}
            </p>
          )}
          {saved && !serverError && (
            <p className="text-xs text-status-success">Nama tersimpan.</p>
          )}
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Menyimpan…' : 'Simpan Nama'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

const PasswordFormSchema = ChangePasswordSchema.extend({
  confirmPassword: z.string().min(1),
}).refine((v) => v.newPassword === v.confirmPassword, {
  message: 'Konfirmasi kata sandi tidak cocok',
  path: ['confirmPassword'],
});

function PasswordForm() {
  const changePasswordMutation = useChangePassword();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(PasswordFormSchema),
    defaultValues: { oldPassword: '', newPassword: '', confirmPassword: '' },
  });

  const onSubmit = async (values: {
    oldPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) => {
    setServerError(null);
    setSaved(false);
    try {
      await changePasswordMutation.mutateAsync({
        oldPassword: values.oldPassword,
        newPassword: values.newPassword,
      });
      setSaved(true);
      reset({ oldPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error) {
      setServerError(
        error instanceof Error
          ? error.message
          : 'Kata sandi belum berubah. Periksa koneksi lalu coba lagi.',
      );
    }
  };

  const isPending = isSubmitting || changePasswordMutation.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ubah Kata Sandi</CardTitle>
        <CardDescription>
          Mengubah kata sandi akan mengeluarkan Anda dari semua sesi lain.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <Label htmlFor="profile-old-password">Kata Sandi Saat Ini</Label>
            <PasswordInput
              id="profile-old-password"
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
            <Label htmlFor="profile-new-password">Kata Sandi Baru</Label>
            <PasswordInput
              id="profile-new-password"
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
            <Label htmlFor="profile-confirm-password">
              Konfirmasi Kata Sandi Baru
            </Label>
            <PasswordInput
              id="profile-confirm-password"
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
            <p role="alert" className="text-xs text-status-danger">
              {serverError}
            </p>
          )}
          {saved && !serverError && (
            <p className="text-xs text-status-success">
              Kata sandi diperbarui.
            </p>
          )}
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Menyimpan…' : 'Ubah Kata Sandi'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function DangerZone() {
  const router = useRouter();
  const deactivateMutation = useDeactivateSelf();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const handleConfirm = async () => {
    setServerError(null);
    try {
      await deactivateMutation.mutateAsync();
      router.push('/login');
      router.refresh();
    } catch (error) {
      setServerError(
        error instanceof Error
          ? error.message
          : 'Akun belum terhapus. Periksa koneksi lalu coba lagi.',
      );
    }
  };

  return (
    <Card className="border-status-danger/30">
      <CardHeader>
        <CardTitle className="text-status-danger">Hapus Akun</CardTitle>
        <CardDescription>
          Anda tidak akan bisa login lagi. Riwayat transaksi atas nama Anda
          tetap tersimpan.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          type="button"
          variant="destructive"
          onClick={() => setDialogOpen(true)}
        >
          Hapus Akun Saya
        </Button>
      </CardContent>
      <DeleteMyAccountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        isSubmitting={deactivateMutation.isPending}
        errorMessage={serverError}
        onConfirm={handleConfirm}
      />
    </Card>
  );
}
