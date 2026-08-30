'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  PlatformAdminLoginSchema,
  type PlatformAdminLogin,
  type PlatformAdminResponse,
} from '@ohmypos/api-contracts';
import { Button } from '@ohmypos/ui/components/button';
import { Input } from '@ohmypos/ui/components/input';
import { PasswordInput } from '@ohmypos/ui/components/password-input';
import { Label } from '@ohmypos/ui/components/label';
import { ArrowRight, ShieldAlert, ShieldCheck } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { apiFetch } from '@/lib/api';

/**
 * ADR-025 — the platform console's front door.
 *
 * Deliberately plainer than `/login`, and not by neglect. The tenant login is
 * a marketing surface a shop owner sees every morning; this one is an internal
 * door that must never be mistaken for it. An operator who lands here expecting
 * the tenant app should notice within a second, which is what the warning strip
 * and the stripped-back layout are for.
 *
 * It lives at `app/platform/login/` — OUTSIDE the `(console)` group — so it is
 * not wrapped by the layout that calls `requirePlatformAdmin()`, which would
 * bounce an unauthenticated visitor straight back here in a loop.
 */
export default function PlatformLoginPage() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PlatformAdminLogin>({
    resolver: zodResolver(PlatformAdminLoginSchema),
  });

  const onSubmit = async (values: PlatformAdminLogin) => {
    setFormError(null);
    try {
      await apiFetch<PlatformAdminResponse>('/platform/auth/login', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      router.push('/platform');
      router.refresh();
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'Belum berhasil masuk. Periksa koneksi lalu coba lagi.',
      );
    }
  };

  return (
    <main className="flex min-h-dvh w-full items-center justify-center bg-surface-dark p-4 sm:p-8">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-3 text-center">
          <Image
            src="/logo-rm-bg.png"
            alt="OhMyPos"
            width={142}
            height={40}
            priority
            className="mx-auto h-8 w-auto object-contain"
          />
          <span className="inline-flex items-center gap-1.5 rounded-xs border border-status-warning/30 bg-status-warning/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-status-warning">
            <ShieldAlert className="size-3" aria-hidden />
            Konsol Platform — Super Admin
          </span>
          <p className="text-xs text-text-tertiary">
            Halaman ini bukan untuk pemilik toko. Masuk sebagai pemilik toko
            melalui halaman masuk biasa.
          </p>
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="space-y-5 rounded-md border border-border-default bg-surface-raised p-6 shadow-1 sm:p-8"
        >
          <div className="space-y-2">
            <Label
              htmlFor="email"
              className="text-xs font-semibold uppercase tracking-wide text-text-primary"
            >
              Alamat Email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="ops@ohmypos.local"
              autoComplete="email"
              aria-invalid={Boolean(errors.email)}
              className="h-11 text-sm"
              {...register('email')}
            />
            {errors.email && (
              <p
                role="alert"
                className="text-xs font-medium text-status-danger"
              >
                {errors.email.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="password"
              className="text-xs font-semibold uppercase tracking-wide text-text-primary"
            >
              Kata Sandi
            </Label>
            <PasswordInput
              id="password"
              placeholder="••••••••"
              autoComplete="current-password"
              aria-invalid={Boolean(errors.password)}
              className="h-11 text-sm"
              {...register('password')}
            />
            {errors.password && (
              <p
                role="alert"
                className="text-xs font-medium text-status-danger"
              >
                {errors.password.message}
              </p>
            )}
          </div>

          {formError && (
            <div
              role="alert"
              className="rounded-sm border border-status-danger/30 bg-status-danger/10 p-3 text-xs font-medium text-status-danger"
            >
              {formError}
            </div>
          )}

          <Button
            type="submit"
            disabled={isSubmitting}
            className="h-11 w-full gap-2 text-sm font-medium"
          >
            {isSubmitting ? (
              <span>Memproses…</span>
            ) : (
              <>
                <span>Masuk ke Konsol</span>
                <ArrowRight className="size-4" />
              </>
            )}
          </Button>
        </form>

        <p className="flex items-center justify-center gap-1.5 text-center font-mono text-[11px] text-text-tertiary">
          <ShieldCheck className="size-3.5 text-brand-primary" />
          Akses tercatat • Sesi berlaku 2 jam
        </p>
      </div>
    </main>
  );
}
