'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  UpdateBusinessProfileSchema,
  type UpdateBusinessProfile,
} from '@ohmypos/api-contracts';
import { Button } from '@ohmypos/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@ohmypos/ui/components/card';
import { Input } from '@ohmypos/ui/components/input';
import { Label } from '@ohmypos/ui/components/label';
import {
  useBusinessProfile,
  useUpdateBusinessProfile,
  useUploadBusinessLogo,
} from '@/hooks/useBusinessProfile';
import { Building2, Upload } from 'lucide-react';

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

export function BusinessProfileClient() {
  const { data: profile, isLoading } = useBusinessProfile();

  if (isLoading || !profile) {
    return <p className="text-sm text-text-tertiary">Memuat…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Profil Bisnis
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Kelola nama, logo, dan alamat bisnis Anda.
        </p>
      </div>

      <LogoSection currentLogoUrl={profile.logoUrl} />
      <InfoSection profile={profile} />
      <MetadataSection id={profile.id} updatedAt={profile.updatedAt} />
    </div>
  );
}

function LogoSection({ currentLogoUrl }: { currentLogoUrl: string | null }) {
  const uploadMutation = useUploadBusinessLogo();
  const [localPreview, setLocalPreview] = React.useState<string | null>(null);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const displayLogo = safeImageSrc(localPreview ?? currentLogoUrl);

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
    } catch (error) {
      setLocalPreview(null);
      setServerError(
        error instanceof Error ? error.message : 'Gagal mengunggah logo.',
      );
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Logo Bisnis</CardTitle>
        <CardDescription>
          Logo akan ditampilkan pada struk transaksi dan dokumen bisnis.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-4">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border-default bg-surface-muted">
          {displayLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={displayLogo}
              alt="Logo Bisnis"
              className="size-full object-cover"
            />
          ) : (
            <Building2 className="size-8 text-text-tertiary" />
          )}
        </div>
        <div className="space-y-2">
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
            <Upload className="mr-2 size-4" />
            {uploadMutation.isPending
              ? 'Mengunggah…'
              : currentLogoUrl
                ? 'Ganti Logo'
                : 'Unggah Logo'}
          </Button>
          {serverError && (
            <p role="alert" className="text-xs text-status-danger">
              {serverError}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function InfoSection({
  profile,
}: {
  profile: { name: string; address: string | null };
}) {
  const updateMutation = useUpdateBusinessProfile();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdateBusinessProfile>({
    resolver: zodResolver(UpdateBusinessProfileSchema),
    defaultValues: {
      name: profile.name,
      address: profile.address ?? '',
    },
  });

  const onSubmit = async (values: UpdateBusinessProfile) => {
    setServerError(null);
    setSaved(false);
    try {
      await updateMutation.mutateAsync({
        name: values.name,
        address: values.address || null,
      });
      setSaved(true);
    } catch (error) {
      setServerError(
        error instanceof Error
          ? error.message
          : 'Gagal menyimpan profil bisnis.',
      );
    }
  };

  const isPending = isSubmitting || updateMutation.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Informasi Bisnis</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="business-name">Nama Bisnis</Label>
            <Input
              id="business-name"
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

          <div className="space-y-1.5">
            <Label htmlFor="business-address">Alamat Bisnis</Label>
            <Input
              id="business-address"
              autoComplete="off"
              aria-invalid={Boolean(errors.address)}
              {...register('address')}
            />
            {errors.address && (
              <p role="alert" className="text-xs text-status-danger">
                {errors.address.message}
              </p>
            )}
          </div>

          {serverError && (
            <p role="alert" className="text-xs text-status-danger">
              {serverError}
            </p>
          )}

          {saved && !serverError && (
            <p className="text-xs text-status-success">Tersimpan.</p>
          )}

          <Button type="submit" disabled={isPending}>
            {isPending ? 'Menyimpan…' : 'Simpan Perubahan'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function MetadataSection({
  id,
  updatedAt,
}: {
  id: string;
  updatedAt: Date | string;
}) {
  const formattedDate = React.useMemo(() => {
    const d = new Date(updatedAt);
    return isNaN(d.getTime()) ? '-' : d.toLocaleString('id-ID');
  }, [updatedAt]);

  return (
    <Card bg-surface-muted>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-text-secondary">
          Metadata / Info Ringkas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs text-text-tertiary">
        <div className="flex justify-between">
          <span>ID Bisnis:</span>
          <span className="font-mono text-text-secondary">{id}</span>
        </div>
        <div className="flex justify-between">
          <span>Terakhir Diperbarui:</span>
          <span className="text-text-secondary">{formattedDate}</span>
        </div>
      </CardContent>
    </Card>
  );
}
