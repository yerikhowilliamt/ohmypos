'use client';

import * as React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateUserSchema, type CreateUser } from '@ohmypos/api-contracts';
import { Button } from '@ohmypos/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ohmypos/ui/components/dialog';
import { Input } from '@ohmypos/ui/components/input';
import { Label } from '@ohmypos/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ohmypos/ui/components/select';
import { useBranches } from '@/hooks/useBranches';
import { useCreateUser } from '@/hooks/useUsers';

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ROLE_LABELS: Record<CreateUser['role'], string> = {
  KASIR: 'Kasir',
  ADMIN: 'Admin',
  OWNER: 'Owner',
};

export function CreateUserDialog({
  open,
  onOpenChange,
}: CreateUserDialogProps) {
  const [serverError, setServerError] = React.useState<string | null>(null);
  const { data: branches = [] } = useBranches();
  const createMutation = useCreateUser();

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(CreateUserSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      role: 'KASIR' as const,
      branchId: null as string | null,
    },
  });

  const role = watch('role');

  React.useEffect(() => {
    if (open) {
      reset({
        name: '',
        email: '',
        password: '',
        role: 'KASIR',
        branchId: null,
      });
      setServerError(null);
    }
  }, [open, reset]);

  React.useEffect(() => {
    // ADR-011 §2 — branchId must be null for ADMIN/OWNER. Clearing it
    // automatically on role change means the toggle back to KASIR is the
    // only place a branch has to be picked.
    if (role !== 'KASIR') {
      setValue('branchId', null);
    }
  }, [role, setValue]);

  const onSubmit = async (values: CreateUser) => {
    setServerError(null);
    try {
      await createMutation.mutateAsync(values);
      onOpenChange(false);
    } catch (error) {
      setServerError(
        error instanceof Error
          ? error.message
          : 'Terjadi kesalahan saat membuat pengguna.',
      );
    }
  };

  const isPending = isSubmitting || createMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>Tambah Pengguna</DialogTitle>
            <DialogDescription>
              Buat akun staf baru. Hanya OWNER yang dapat melakukan ini
              (ADR-011).
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="user-name">Nama</Label>
              <Input
                id="user-name"
                placeholder="Nama lengkap staf"
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
              <Label htmlFor="user-email">Email</Label>
              <Input
                id="user-email"
                type="email"
                placeholder="nama@contoh.com"
                autoComplete="off"
                aria-invalid={Boolean(errors.email)}
                {...register('email')}
              />
              {errors.email && (
                <p role="alert" className="text-xs text-status-danger">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="user-password">Password Awal</Label>
              <Input
                id="user-password"
                type="password"
                placeholder="Minimal 8 karakter"
                autoComplete="new-password"
                aria-invalid={Boolean(errors.password)}
                {...register('password')}
              />
              {errors.password && (
                <p role="alert" className="text-xs text-status-danger">
                  {errors.password.message}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="user-role">Peran</Label>
                <Controller
                  name="role"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger
                        id="user-role"
                        aria-invalid={Boolean(errors.role)}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(ROLE_LABELS) as CreateUser['role'][]).map(
                          (value) => (
                            <SelectItem key={value} value={value}>
                              {ROLE_LABELS[value]}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              {role === 'KASIR' && (
                <div className="space-y-1.5">
                  <Label htmlFor="user-branch">Cabang</Label>
                  <Controller
                    name="branchId"
                    control={control}
                    render={({ field }) => (
                      <Select
                        value={field.value ?? undefined}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger
                          id="user-branch"
                          aria-invalid={Boolean(errors.branchId)}
                        >
                          <SelectValue placeholder="Pilih cabang" />
                        </SelectTrigger>
                        <SelectContent>
                          {branches.map((branch) => (
                            <SelectItem key={branch.id} value={branch.id}>
                              {branch.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {errors.branchId && (
                    <p role="alert" className="text-xs text-status-danger">
                      {errors.branchId.message}
                    </p>
                  )}
                </div>
              )}
            </div>

            {serverError && (
              <div
                role="alert"
                className="rounded-sm border border-status-danger/30 bg-status-danger/10 p-3 text-xs text-status-danger"
              >
                {serverError}
              </div>
            )}
          </div>

          <DialogFooter className="mt-6 gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => onOpenChange(false)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Menyimpan…' : 'Tambah Pengguna'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
