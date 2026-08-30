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
import { PasswordInput } from '@ohmypos/ui/components/password-input';
import { Label } from '@ohmypos/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ohmypos/ui/components/select';
import { useBranches } from '@/hooks/useBranches';
import { useCurrentUser } from '@/hooks/useProfile';
import { useCreateUser } from '@/hooks/useUsers';
import { domainOf, suggestStaffEmail } from '@/lib/staff-email';

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
  const { data: allBranches = [] } = useBranches();
  // A KASIR assigned to the system location would log in to a POS that excludes
  // their own branch and land on an empty screen with no explanation.
  const branches = React.useMemo(
    () => allBranches.filter((branch) => !branch.isSystem),
    [allBranches],
  );
  const { data: currentUser } = useCurrentUser();
  const createMutation = useCreateUser();
  /**
   * Set the moment the Owner types in the email field, so a later edit to the
   * name never overwrites an address they chose themselves. State rather than
   * a ref because the hint below the field renders off it — a ref flips
   * silently and the hint would keep claiming the address is automatic.
   */
  const [emailEdited, setEmailEdited] = React.useState(false);
  const ownerDomain = currentUser?.email ? domainOf(currentUser.email) : null;

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
      setEmailEdited(false);
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
            <DialogTitle>Tambah Pengguna Baru</DialogTitle>
            <DialogDescription>
              Buat akun untuk kasir atau admin toko. Kasir wajib ditentukan
              cabang tugasnya.
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
                {...register('name', {
                  // Derived on change rather than in an effect: the repo's
                  // react-hooks/set-state-in-effect rule rejects the effect
                  // form, and this keeps the two fields in step with no
                  // second source of truth.
                  onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                    if (emailEdited) return;
                    const suggestion = suggestStaffEmail(
                      e.target.value,
                      currentUser?.email,
                    );
                    // null when the name folds to nothing or the Owner's
                    // address has no domain — leave the field alone rather
                    // than write a guess into it.
                    if (suggestion !== null) {
                      setValue('email', suggestion, { shouldValidate: false });
                    }
                  },
                })}
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
                placeholder={
                  ownerDomain ? `nama@${ownerDomain}` : 'nama@contoh.com'
                }
                autoComplete="off"
                aria-invalid={Boolean(errors.email)}
                {...register('email', {
                  onChange: () => {
                    // Guarded so only the first keystroke re-renders.
                    if (!emailEdited) setEmailEdited(true);
                  },
                })}
              />
              {ownerDomain && !emailEdited && (
                <p className="text-xs text-text-tertiary">
                  Terisi otomatis dari domain <strong>{ownerDomain}</strong>.
                  Bisa diubah.
                </p>
              )}
              {errors.email && (
                <p role="alert" className="text-xs text-status-danger">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="user-password">Password Awal</Label>
              <PasswordInput
                id="user-password"
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
