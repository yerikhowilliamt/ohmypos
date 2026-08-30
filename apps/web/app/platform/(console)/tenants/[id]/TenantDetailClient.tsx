'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  ResetTenantOwnerPasswordSchema,
  StartImpersonationSchema,
  type ResetTenantOwnerPassword,
  type StartImpersonation,
} from '@ohmypos/api-contracts';
import { Button } from '@ohmypos/ui/components/button';
import { Label } from '@ohmypos/ui/components/label';
import { Input } from '@ohmypos/ui/components/input';
import { PasswordInput } from '@ohmypos/ui/components/password-input';
import { Skeleton } from '@ohmypos/ui/components/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ohmypos/ui/components/dialog';
import {
  ArrowLeft,
  Eye,
  KeyRound,
  PauseCircle,
  PlayCircle,
} from 'lucide-react';
import { TenantStatusBadge } from '@/components/platform/TenantStatusBadge';
import {
  usePlatformTenant,
  useResetTenantOwnerPassword,
  useStartImpersonation,
  useTenantImpersonations,
  useUpdateTenant,
} from '@/hooks/usePlatformTenants';
import { formatCurrency, formatThousands } from '@/lib/formatters';

/**
 * ADR-025 — one tenant: what it uses, whether it is switched on, and who has
 * looked inside it.
 *
 * The impersonation history sits on this page rather than behind a separate
 * screen deliberately. It is the record of operators reading a customer's
 * books, and a record nobody passes on the way to the button that adds to it is
 * a record that never gets read.
 */
export function TenantDetailClient({ tenantId }: { tenantId: string }) {
  const { data: tenant, isLoading } = usePlatformTenant(tenantId);
  const { data: sessions } = useTenantImpersonations(tenantId);
  const updateTenant = useUpdateTenant(tenantId);
  const [isImpersonateOpen, setImpersonateOpen] = React.useState(false);
  const [isResetPasswordOpen, setResetPasswordOpen] = React.useState(false);
  const [statusError, setStatusError] = React.useState<string | null>(null);

  const toggleStatus = async () => {
    if (!tenant) return;
    setStatusError(null);
    try {
      await updateTenant.mutateAsync({
        status: tenant.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
      });
    } catch (error) {
      setStatusError(
        error instanceof Error
          ? error.message
          : 'Status tenant belum berhasil diubah.',
      );
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <p className="text-sm text-text-secondary">Tenant tidak ditemukan.</p>
        <Link
          href="/platform/tenants"
          className="text-sm text-brand-primary hover:underline"
        >
          Kembali ke daftar tenant
        </Link>
      </div>
    );
  }

  const isSuspended = tenant.status === 'SUSPENDED';

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <Link
        href="/platform/tenants"
        className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Semua tenant
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="font-serif text-2xl font-semibold text-text-primary">
              {tenant.name}
            </h1>
            <TenantStatusBadge status={tenant.status} />
          </div>
          <p className="font-mono text-xs text-text-tertiary">
            {tenant.slug}
            {tenant.ownerEmail ? ` · ${tenant.ownerEmail}` : ''}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => setImpersonateOpen(true)}
          >
            <Eye className="size-4" aria-hidden />
            Masuk sebagai Owner
          </Button>
          <Button
            type="button"
            variant={isSuspended ? 'default' : 'outline'}
            className="gap-2"
            onClick={toggleStatus}
            disabled={updateTenant.isPending}
          >
            {isSuspended ? (
              <PlayCircle className="size-4" aria-hidden />
            ) : (
              <PauseCircle className="size-4" aria-hidden />
            )}
            {isSuspended ? 'Aktifkan kembali' : 'Tangguhkan'}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => setResetPasswordOpen(true)}
            // Nothing to reset when the tenant has no active OWNER, and a
            // dialog that can only fail is worse than a button that says so.
            disabled={!tenant.ownerId}
            title={
              tenant.ownerId ? undefined : 'Tenant ini tidak punya Owner aktif.'
            }
          >
            <KeyRound className="size-4" aria-hidden />
            Reset kata sandi Owner
          </Button>
        </div>
      </header>

      {statusError && (
        <p
          role="alert"
          className="rounded-sm border border-status-danger/30 bg-status-danger/10 p-3 text-xs font-medium text-status-danger"
        >
          {statusError}
        </p>
      )}

      {isSuspended && (
        <p className="rounded-sm border border-status-warning/30 bg-status-warning/10 p-3 text-xs text-text-primary">
          Tenant ditangguhkan. Seluruh penggunanya langsung tidak bisa memakai
          aplikasi — hanya keluar dari sesi yang masih diizinkan. Anda tetap
          bisa membaca datanya lewat mode impersonasi.
        </p>
      )}

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        <Stat label="Pengguna" value={formatThousands(tenant.userCount)} />
        <Stat label="Cabang" value={formatThousands(tenant.branchCount)} />
        <Stat label="Produk" value={formatThousands(tenant.productCount)} />
        <Stat
          label="Bahan baku"
          value={formatThousands(tenant.rawMaterialCount)}
        />
        <Stat label="Transaksi" value={formatThousands(tenant.saleCount)} />
        <Stat label="Omzet kotor" value={formatCurrency(tenant.grossRevenue)} />
      </dl>

      <section className="rounded-md border border-border-default bg-surface-raised">
        <h2 className="border-b border-border-default px-4 py-3 text-sm font-semibold text-text-primary">
          Riwayat impersonasi
        </h2>
        {!sessions || sessions.length === 0 ? (
          <p className="p-6 text-center text-sm text-text-tertiary">
            Belum pernah ada operator yang masuk ke tenant ini.
          </p>
        ) : (
          <ul className="divide-y divide-border-default">
            {sessions.map((session) => (
              <li key={session.id} className="space-y-1 px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm text-text-primary">
                    {session.actingAsEmail}
                  </span>
                  <span className="font-mono text-[11px] text-text-tertiary">
                    {new Date(session.startedAt).toLocaleString('id-ID')}
                    {session.endedAt
                      ? ` — ${new Date(session.endedAt).toLocaleTimeString('id-ID')}`
                      : ' — masih berjalan'}
                  </span>
                </div>
                <p className="text-xs text-text-secondary">{session.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ImpersonateDialog
        tenantId={tenantId}
        tenantName={tenant.name}
        open={isImpersonateOpen}
        onOpenChange={setImpersonateOpen}
      />

      <ResetOwnerPasswordDialog
        key={String(isResetPasswordOpen)}
        tenantId={tenantId}
        ownerId={tenant.ownerId}
        ownerEmail={tenant.ownerEmail}
        open={isResetPasswordOpen}
        onOpenChange={setResetPasswordOpen}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-border-default bg-surface-raised p-3">
      <dt className="text-[11px] uppercase tracking-wide text-text-tertiary">
        {label}
      </dt>
      <dd className="mt-1 font-mono text-sm font-semibold text-text-primary">
        {value}
      </dd>
    </div>
  );
}

function ImpersonateDialog({
  tenantId,
  tenantName,
  open,
  onOpenChange,
}: {
  tenantId: string;
  tenantName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const startImpersonation = useStartImpersonation(tenantId);
  const [formError, setFormError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<StartImpersonation>({
    resolver: zodResolver(StartImpersonationSchema),
  });

  const onSubmit = async (values: StartImpersonation) => {
    setFormError(null);
    try {
      await startImpersonation.mutateAsync(values);
      reset();
      onOpenChange(false);
      // Straight into the tenant app. The banner comes from the cookie the
      // route handler just set, so it is already there on first paint.
      router.push('/');
      router.refresh();
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'Sesi impersonasi belum bisa dimulai.',
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Masuk sebagai Owner {tenantName}</DialogTitle>
          <DialogDescription>
            Sesi hanya bisa membaca dan berlaku 30 menit. Alasan Anda tersimpan
            permanen di jejak audit tenant ini.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label
              htmlFor="reason"
              className="text-xs font-semibold text-text-primary"
            >
              Alasan
            </Label>
            <Input
              id="reason"
              placeholder="Menelusuri laporan HPP yang dikeluhkan Owner"
              aria-invalid={Boolean(errors.reason)}
              {...register('reason')}
            />
            {errors.reason && (
              <p
                role="alert"
                className="text-xs font-medium text-status-danger"
              >
                {errors.reason.message}
              </p>
            )}
          </div>

          {formError && (
            <p
              role="alert"
              className="rounded-sm border border-status-danger/30 bg-status-danger/10 p-3 text-xs font-medium text-status-danger"
            >
              {formError}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Memulai…' : 'Mulai sesi baca'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * TASK-130 — the operator's recovery path for a tenant OWNER who cannot get in.
 *
 * Shaped after `ImpersonateDialog` above, and for the same reason: both are an
 * operator reaching into somebody else's business, so both state what will
 * happen before the button is pressed and both record why. The differences are
 * that this one WRITES, and that what it writes is a working credential.
 */
const ResetOwnerPasswordFormSchema = ResetTenantOwnerPasswordSchema.omit({
  userId: true,
})
  .extend({ confirmPassword: z.string().min(1, 'Konfirmasi wajib diisi') })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'Konfirmasi kata sandi tidak cocok',
    path: ['confirmPassword'],
  });

type ResetOwnerPasswordFormValues = z.infer<
  typeof ResetOwnerPasswordFormSchema
>;

function ResetOwnerPasswordDialog({
  tenantId,
  ownerId,
  ownerEmail,
  open,
  onOpenChange,
}: {
  tenantId: string;
  ownerId: string | null;
  ownerEmail: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const resetPassword = useResetTenantOwnerPassword(tenantId);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(
    null,
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ResetOwnerPasswordFormValues>({
    resolver: zodResolver(ResetOwnerPasswordFormSchema),
    defaultValues: { newPassword: '', confirmPassword: '', reason: '' },
  });

  // No reset-on-open effect — the page keys this component on `open`, so each
  // opening mounts a fresh one. See the note in `users/ResetPasswordDialog`.

  const onSubmit = async (values: ResetOwnerPasswordFormValues) => {
    if (!ownerId) return;
    setFormError(null);
    try {
      const result = await resetPassword.mutateAsync({
        userId: ownerId,
        newPassword: values.newPassword,
        reason: values.reason,
      } satisfies ResetTenantOwnerPassword);
      // Cleared as soon as the request succeeds — the typed password has no
      // reason to stay in this component, and the dialog never shows it again.
      reset({ newPassword: '', confirmPassword: '', reason: '' });
      setSuccessMessage(result.message);
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'Kata sandi Owner belum direset.',
      );
    }
  };

  const isPending = isSubmitting || resetPassword.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Reset kata sandi Owner{ownerEmail ? ` — ${ownerEmail}` : ''}
          </DialogTitle>
          <DialogDescription>
            Owner akan langsung keluar dari semua perangkat. Alasan yang Anda
            tulis tersimpan permanen. Sampaikan kata sandi barunya lewat jalur
            terpisah, jangan lewat email biasa.
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
              <Label
                htmlFor="owner-new-password"
                className="text-xs font-semibold text-text-primary"
              >
                Kata sandi baru
              </Label>
              <PasswordInput
                id="owner-new-password"
                autoComplete="new-password"
                aria-invalid={Boolean(errors.newPassword)}
                {...register('newPassword')}
              />
              {errors.newPassword && (
                <p
                  role="alert"
                  className="text-xs font-medium text-status-danger"
                >
                  {errors.newPassword.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="owner-confirm-password"
                className="text-xs font-semibold text-text-primary"
              >
                Konfirmasi kata sandi baru
              </Label>
              <PasswordInput
                id="owner-confirm-password"
                autoComplete="new-password"
                aria-invalid={Boolean(errors.confirmPassword)}
                {...register('confirmPassword')}
              />
              {errors.confirmPassword && (
                <p
                  role="alert"
                  className="text-xs font-medium text-status-danger"
                >
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="owner-reset-reason"
                className="text-xs font-semibold text-text-primary"
              >
                Alasan
              </Label>
              <Input
                id="owner-reset-reason"
                placeholder="Owner melapor terkunci dan tidak ada Owner lain"
                aria-invalid={Boolean(errors.reason)}
                {...register('reason')}
              />
              {errors.reason && (
                <p
                  role="alert"
                  className="text-xs font-medium text-status-danger"
                >
                  {errors.reason.message}
                </p>
              )}
            </div>

            {formError && (
              <p
                role="alert"
                className="rounded-sm border border-status-danger/30 bg-status-danger/10 p-3 text-xs font-medium text-status-danger"
              >
                {formError}
              </p>
            )}

            <DialogFooter>
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
