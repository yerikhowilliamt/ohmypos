'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  LoginSchema,
  type Login,
  type LoginResponse,
} from '@ohmypos/api-contracts';
import { Button } from '@ohmypos/ui/components/button';
import { Input } from '@ohmypos/ui/components/input';
import { PasswordInput } from '@ohmypos/ui/components/password-input';
import { Label } from '@ohmypos/ui/components/label';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Lock,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { apiFetch } from '@/lib/api';

/**
 * Split-Screen Editorial Luxury Login (DESIGN.md)
 * Validates with Zod schema from @ohmypos/api-contracts (ADR-010).
 * HttpOnly cookies managed by backend.
 */
export default function LoginPage() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [attendanceWarning, setAttendanceWarning] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Login>({ resolver: zodResolver(LoginSchema) });

  const onSubmit = async (values: Login) => {
    setFormError(null);
    try {
      const response = await apiFetch<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      if (response.attendance && !response.attendance.isValid) {
        setAttendanceWarning(true);
        return;
      }
      router.push('/');
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
    <main className="flex min-h-screen w-full bg-surface-base">
      {/* Left Column: Editorial Dark Slate (Tablet & Desktop) */}
      <div className="relative hidden w-full flex-col justify-between overflow-hidden bg-surface-dark p-6 md:flex md:w-5/12 lg:w-1/2 lg:p-12">
        {/* Subtle geometric pattern overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `radial-gradient(var(--color-brand-primary) 1px, transparent 1px)`,
            backgroundSize: '24px 24px',
          }}
        />

        {/* Ambient Gold Glow Header Accent */}
        <div className="pointer-events-none absolute -left-20 -top-20 size-96 rounded-full bg-brand-primary/10 blur-3xl" />

        {/* Brand Bar */}
        <div className="relative z-10 flex items-center gap-3">
          <div>
            <Image
              src="/logo-rm-bg.png"
              alt="OhMyPos"
              width={142}
              height={40}
              priority
              className="h-7 w-auto object-contain lg:h-9"
            />
            <p className="text-[10px] uppercase tracking-widest text-text-gold lg:text-xs">
              Quiet Luxury. Precise Operations.
            </p>
          </div>
        </div>

        {/* Hero Editorial Quote & Trust Badges */}
        <div className="relative z-10 max-w-lg space-y-4 lg:space-y-8">
          <div className="space-y-2.5 lg:space-y-4">
            <span className="inline-flex items-center gap-1.5 rounded-xs border border-brand-primary/30 bg-brand-primary/10 px-2.5 py-0.5 text-[10px] font-semibold tracking-wider text-brand-primary uppercase lg:px-3 lg:py-1 lg:text-xs">
              <Building2 className="size-3 lg:size-3.5" /> High-Touch Operations
            </span>
            <h2 className="font-serif text-2xl font-semibold leading-tight text-text-inverse lg:text-4xl">
              Uncompromising financial precision for luxury hospitality &amp;
              retail.
            </h2>
            <p className="text-xs leading-relaxed text-text-tertiary lg:text-sm">
              Quiet luxury aesthetics outside, high-precision transactional
              engine inside. Engineered for immediate operational speed and zero
              numerical ambiguity.
            </p>
          </div>

          {/* Pillars List */}
          <div className="grid grid-cols-1 gap-2.5 border-t border-border-strong/20 pt-4 lg:grid-cols-2 lg:gap-4 lg:pt-6">
            <div className="flex items-start gap-2 lg:gap-2.5">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-brand-primary lg:size-4" />
              <div>
                <p className="text-xs font-medium text-text-inverse">
                  Real-Time Reconciliation
                </p>
                <p className="text-[10px] text-text-tertiary lg:text-[11px]">
                  Automated split-allocation
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2 lg:gap-2.5">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-brand-primary lg:size-4" />
              <div>
                <p className="text-xs font-medium text-text-inverse">
                  Multi-Branch Vault
                </p>
                <p className="text-[10px] text-text-tertiary lg:text-[11px]">
                  Centralized inventory &amp; cash
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2 lg:gap-2.5">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-brand-primary lg:size-4" />
              <div>
                <p className="text-xs font-medium text-text-inverse">
                  High-Precision Ledger
                </p>
                <p className="text-[10px] text-text-tertiary lg:text-[11px]">
                  COGS &amp; HPP calculation
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2 lg:gap-2.5">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-brand-primary lg:size-4" />
              <div>
                <p className="text-xs font-medium text-text-inverse">
                  End-to-End Compliance
                </p>
                <p className="text-[10px] text-text-tertiary lg:text-[11px]">
                  Strict RBAC &amp; audit trailing
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Left Footer */}
        <div className="relative z-10 flex flex-col items-start gap-1 border-t border-border-strong/20 pt-4 text-xs text-text-tertiary lg:flex-row lg:items-center lg:justify-between lg:pt-6">
          <div className="flex items-center gap-1.5 lg:gap-2">
            <ShieldCheck className="size-3.5 text-brand-primary lg:size-4" />
            <span className="text-[11px] lg:text-xs">
              Banking-Grade Security Standard
            </span>
          </div>
          <span className="font-mono text-[10px] lg:text-[11px]">
            v1.1 • System Active
          </span>
        </div>
      </div>

      {/* Right Column: Refined Alabaster Card Login Form */}
      <div className="relative flex w-full items-center justify-center p-4 sm:p-6 md:w-7/12 md:p-8 lg:w-1/2 lg:p-12">
        {/* Subtle decorative gold ambient glow for mobile */}
        <div className="pointer-events-none absolute -top-16 right-0 size-72 rounded-full bg-brand-primary/5 blur-3xl md:hidden" />

        <div className="relative z-10 w-full max-w-sm space-y-6 sm:max-w-md sm:space-y-8">
          {/* Header Mobile/Tablet/Desktop */}
          <div className="space-y-3 text-center md:text-left">
            <div className="flex flex-col items-center gap-2 md:items-start">
              <Image
                src="/logo-rm-bg.png"
                alt="OhMyPos"
                width={142}
                height={40}
                priority
                className="h-8 w-auto object-contain sm:h-9"
              />
              <span className="inline-flex items-center gap-1.5 rounded-xs border border-brand-primary/30 bg-brand-primary/10 px-2.5 py-0.5 text-[10px] font-semibold tracking-widest text-brand-secondary uppercase md:hidden">
                <Sparkles className="size-3 text-brand-primary" />
                Quiet Luxury. Precise Operations.
              </span>
            </div>
            <div>
              <h2 className="font-serif text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
                Selamat Datang
              </h2>
              <p className="mt-1 text-xs text-text-secondary sm:text-sm">
                Masukkan kredensial Anda untuk mengakses portal OhMyPos.
              </p>
            </div>
          </div>

          {/* Form Container */}
          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            className="rounded-md border border-border-default bg-surface-raised p-6 shadow-1 sm:p-8"
          >
            {attendanceWarning && (
              <div
                role="alert"
                className="mb-6 rounded-sm border border-status-warning/30 bg-status-warning/10 p-4 text-xs text-text-primary"
              >
                <div className="flex items-start gap-2">
                  <Lock className="mt-0.5 size-4 shrink-0 text-status-warning" />
                  <div>
                    <p className="font-semibold text-status-warning">
                      Absensi Luar Perangkat
                    </p>
                    <p className="mt-1">
                      Perangkat ini belum terdaftar resmi untuk cabang Anda.
                      Login tetap berhasil, tapi tercatat sebagai absensi di
                      luar perangkat resmi. Hubungi Owner jika ada kekeliruan.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3 min-h-[36px] w-full border-border-strong text-xs font-medium"
                      onClick={() => {
                        router.push('/');
                        router.refresh();
                      }}
                    >
                      Lanjutkan ke Aplikasi
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-5">
              <div className="space-y-2">
                <Label
                  htmlFor="email"
                  className="text-xs font-semibold tracking-wide text-text-primary uppercase"
                >
                  Alamat Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="nama@ohmypos.com"
                  autoComplete="email"
                  aria-invalid={Boolean(errors.email)}
                  className="h-10 text-sm sm:h-11"
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
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="password"
                    className="text-xs font-semibold tracking-wide text-text-primary uppercase"
                  >
                    Kata Sandi
                  </Label>
                </div>
                <PasswordInput
                  id="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  aria-invalid={Boolean(errors.password)}
                  className="h-10 text-sm sm:h-11"
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
                className="mt-2 h-11 w-full gap-2 text-sm font-medium"
              >
                {isSubmitting ? (
                  <span>Memproses…</span>
                ) : (
                  <>
                    <span>Masuk ke Sistem</span>
                    <ArrowRight className="size-4" />
                  </>
                )}
              </Button>
            </div>
          </form>

          {/* Footer Security Notice */}
          <div className="flex flex-col items-center justify-center gap-2 text-center text-xs text-text-tertiary">
            <div className="flex items-center gap-1.5 font-mono text-[11px]">
              <ShieldCheck className="size-3.5 text-brand-primary" />
              <span>Encrypted 256-bit Connection</span>
            </div>
            <p className="text-[11px]">
              Authorized Personnel Only • OhMyPos Platform
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
