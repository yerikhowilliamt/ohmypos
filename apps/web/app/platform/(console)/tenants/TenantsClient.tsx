'use client';

import * as React from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import type { CreateTenant, TenantListItem } from '@ohmypos/api-contracts';
import { CreateTenantSchema } from '@ohmypos/api-contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Button } from '@ohmypos/ui/components/button';
import { Input } from '@ohmypos/ui/components/input';
import { PasswordInput } from '@ohmypos/ui/components/password-input';
import { Label } from '@ohmypos/ui/components/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ohmypos/ui/components/dialog';
import { Plus } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { TenantStatusBadge } from '@/components/platform/TenantStatusBadge';
import {
  useCreateTenant,
  usePlatformTenants,
} from '@/hooks/usePlatformTenants';

const DEFAULT_LIMIT = 25;

/**
 * ADR-025 — the tenant list, and the only place a tenant is created.
 *
 * Creation is one form rather than a wizard because it is one transaction
 * (ADR-025 Decision 7): the tenant, its profile, its system refs and its first
 * OWNER all land together or not at all. A two-step flow would let an operator
 * produce a tenant nobody can log into, which is precisely what that decision
 * exists to prevent.
 */
export function TenantsClient() {
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(DEFAULT_LIMIT);
  const [isCreateOpen, setCreateOpen] = React.useState(false);

  const { data, isLoading } = usePlatformTenants(page, limit);

  const columns = React.useMemo<ColumnDef<TenantListItem>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Nama bisnis',
        cell: ({ row }) => (
          <Link
            href={`/platform/tenants/${row.original.id}`}
            className="font-medium text-text-primary hover:text-brand-primary hover:underline"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: 'slug',
        header: 'Slug',
        cell: ({ row }) => (
          <span className="font-mono text-xs text-text-secondary">
            {row.original.slug}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <TenantStatusBadge status={row.original.status} />,
      },
      {
        accessorFn: (row) => row.userCount,
        id: 'userCount',
        header: 'Pengguna',
        meta: { align: 'right' },
      },
      {
        accessorFn: (row) => row.branchCount,
        id: 'branchCount',
        header: 'Cabang',
        meta: { align: 'right' },
      },
      {
        accessorFn: (row) => row.saleCount,
        id: 'saleCount',
        header: 'Transaksi',
        meta: { align: 'right' },
      },
    ],
    [],
  );

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-serif text-2xl font-semibold text-text-primary">
            Tenant
          </h1>
          <p className="text-sm text-text-secondary">
            Setiap baris adalah satu bisnis dengan data yang terpisah penuh.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="gap-2"
        >
          <Plus className="size-4" aria-hidden />
          Tenant baru
        </Button>
      </header>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        emptyMessage="Belum ada tenant"
        emptyDescription="Buat tenant pertama beserta akun Owner-nya."
        pagination={
          data
            ? {
                meta: data.meta,
                onPageChange: setPage,
                onLimitChange: (next) => {
                  setLimit(next);
                  setPage(1);
                },
                itemNoun: 'tenant',
              }
            : undefined
        }
      />

      <CreateTenantDialog open={isCreateOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function CreateTenantDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createTenant = useCreateTenant();
  const [formError, setFormError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateTenant>({ resolver: zodResolver(CreateTenantSchema) });

  const onSubmit = async (values: CreateTenant) => {
    setFormError(null);
    try {
      await createTenant.mutateAsync(values);
      reset();
      onOpenChange(false);
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'Tenant belum berhasil dibuat. Coba lagi.',
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Tenant baru</DialogTitle>
          <DialogDescription>
            Tenant, profil bisnis, lokasi &quot;Umum&quot;, dua kategori sistem,
            dan akun Owner pertama dibuat sekaligus dalam satu transaksi.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="space-y-4"
        >
          <Field
            id="name"
            label="Nama bisnis"
            error={errors.name?.message}
            {...register('name')}
          />
          <Field
            id="slug"
            label="Slug"
            placeholder="kopi-melati"
            hint="Huruf kecil, angka, dan tanda hubung. Dipakai operator untuk mengenali tenant, bukan untuk routing."
            error={errors.slug?.message}
            {...register('slug')}
          />

          <fieldset className="space-y-4 rounded-sm border border-border-default p-4">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              Owner pertama
            </legend>
            <Field
              id="owner-name"
              label="Nama"
              error={errors.owner?.name?.message}
              {...register('owner.name')}
            />
            <Field
              id="owner-email"
              label="Email"
              type="email"
              hint="Satu email hanya bisa dipakai di satu tenant."
              error={errors.owner?.email?.message}
              {...register('owner.email')}
            />
            <Field
              id="owner-password"
              label="Kata sandi"
              type="password"
              hint="Minimal 8 karakter. Sampaikan ke Owner lewat jalur terpisah."
              error={errors.owner?.password?.message}
              {...register('owner.password')}
            />
          </fieldset>

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
              {isSubmitting ? 'Membuat…' : 'Buat tenant'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const Field = React.forwardRef<
  HTMLInputElement,
  React.ComponentPropsWithoutRef<'input'> & {
    id: string;
    label: string;
    hint?: string;
    error?: string;
  }
>(function Field({ id, label, hint, error, ...props }, ref) {
  // Password fields get the show/hide toggle; everything else stays a plain
  // input, so the `type` prop keeps deciding the control from the call site.
  const Control = props.type === 'password' ? PasswordInput : Input;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-semibold text-text-primary">
        {label}
      </Label>
      <Control id={id} ref={ref} aria-invalid={Boolean(error)} {...props} />
      {hint && !error && (
        <p className="text-[11px] text-text-tertiary">{hint}</p>
      )}
      {error && (
        <p role="alert" className="text-xs font-medium text-status-danger">
          {error}
        </p>
      )}
    </div>
  );
});
