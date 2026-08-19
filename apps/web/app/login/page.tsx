'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  LoginSchema,
  type Login,
  type LoginResponse,
} from '@ohmypos/api-contracts';
import { Button } from '@ohmypos/ui/components/button';
import { Input } from '@ohmypos/ui/components/input';
import { Label } from '@ohmypos/ui/components/label';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { apiFetch } from '@/lib/api';

/**
 * The login form validates with the very same Zod schema the API validates
 * against (ADR-010) — the rule is written once, in packages/api-contracts.
 *
 * No token is handled here: the API sets HttpOnly cookies, which JavaScript
 * cannot read (System Design §5).
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
      router.replace('/');
      router.refresh();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Login failed');
    }
  };

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="w-full max-w-sm rounded-sm border border-border-default bg-surface-raised p-6 shadow-1"
      >
        <div className="mb-2">
          <Image
            src="/logo.svg"
            alt="OhMyPos"
            width={142}
            height={40}
            priority
            className="h-8 w-auto object-contain"
          />
        </div>
        <h1 className="sr-only">OhMyPos</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Masuk untuk melanjutkan.
        </p>

        {attendanceWarning && (
          <div
            role="alert"
            className="mb-4 rounded-sm border border-status-warning/30 bg-status-warning/10 p-3 text-xs text-text-primary"
          >
            Login berhasil, tapi perangkat ini tidak terdaftar sebagai terminal
            resmi cabang Anda. Ini dicatat sebagai pelanggaran absensi. Hubungi
            Owner jika ini adalah kesalahan.
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 w-full"
              onClick={() => {
                router.replace('/');
                router.refresh();
              }}
            >
              Lanjutkan ke Aplikasi
            </Button>
          </div>
        )}

        <div className="mt-6 space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            aria-invalid={Boolean(errors.email)}
            {...register('email')}
          />
          {errors.email && (
            <p role="alert" className="text-xs text-status-danger">
              {errors.email.message}
            </p>
          )}
        </div>

        <div className="mt-4 space-y-2">
          <Label htmlFor="password">Kata sandi</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={Boolean(errors.password)}
            {...register('password')}
          />
          {errors.password && (
            <p role="alert" className="text-xs text-status-danger">
              {errors.password.message}
            </p>
          )}
        </div>

        {formError && (
          <p role="alert" className="mt-4 text-sm text-status-danger">
            {formError}
          </p>
        )}

        <Button type="submit" disabled={isSubmitting} className="mt-6 w-full">
          {isSubmitting ? 'Memproses…' : 'Masuk'}
        </Button>
      </form>
    </main>
  );
}
