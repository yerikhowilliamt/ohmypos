'use client';

import * as React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  UpdateUserSchema,
  type UpdateUser,
  type UserResponse,
} from '@ohmypos/api-contracts';
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
import { useUpdateUser } from '@/hooks/useUsers';

interface EditUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserResponse | null;
}

const ROLE_LABELS: Record<UserResponse['role'], string> = {
  KASIR: 'Kasir',
  ADMIN: 'Admin',
  OWNER: 'Owner',
};

export function EditUserDialog({
  open,
  onOpenChange,
  user,
}: EditUserDialogProps) {
  const [serverError, setServerError] = React.useState<string | null>(null);
  const { data: branches = [] } = useBranches();
  const updateMutation = useUpdateUser();

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(UpdateUserSchema),
    defaultValues: {
      name: '',
      email: '',
      role: 'KASIR' as UserResponse['role'],
      branchId: null as string | null,
    },
  });

  const role = watch('role');

  React.useEffect(() => {
    if (open && user) {
      reset({
        name: user.name,
        email: user.email,
        role: user.role,
        branchId: user.branchId,
      });
      setServerError(null);
    }
  }, [open, user, reset]);

  React.useEffect(() => {
    // Mirrors CreateUserDialog: ADMIN/OWNER never carry a branchId
    // (ADR-011 §2). The server re-validates the merge anyway — this just
    // keeps the form from offering an invalid combination in the first place.
    if (role !== 'KASIR') {
      setValue('branchId', null);
      clearErrors('branchId');
    }
  }, [role, setValue, clearErrors]);

  const onSubmit = async (values: UpdateUser) => {
    if (!user) return;
    if (values.role === 'KASIR' && !values.branchId) {
      setError('branchId', {
        message: 'Cabang wajib dipilih untuk peran Kasir',
      });
      return;
    }

    setServerError(null);
    try {
      await updateMutation.mutateAsync({ id: user.id, data: values });
      onOpenChange(false);
    } catch (error) {
      setServerError(
        error instanceof Error
          ? error.message
          : 'Terjadi kesalahan saat menyimpan pengguna.',
      );
    }
  };

  const isPending = isSubmitting || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>Ubah Data Pengguna</DialogTitle>
            <DialogDescription>
              Perbarui data nama, peran akses, atau cabang penugasan pengguna.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-user-name">Nama</Label>
              <Input
                id="edit-user-name"
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
              <Label htmlFor="edit-user-email">Email</Label>
              <Input
                id="edit-user-email"
                type="email"
                aria-invalid={Boolean(errors.email)}
                {...register('email')}
              />
              {errors.email && (
                <p role="alert" className="text-xs text-status-danger">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-user-role">Peran</Label>
                <Controller
                  name="role"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="edit-user-role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(
                          Object.keys(ROLE_LABELS) as UserResponse['role'][]
                        ).map((value) => (
                          <SelectItem key={value} value={value}>
                            {ROLE_LABELS[value]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              {role === 'KASIR' && (
                <div className="space-y-1.5">
                  <Label htmlFor="edit-user-branch">Cabang</Label>
                  <Controller
                    name="branchId"
                    control={control}
                    render={({ field }) => (
                      <Select
                        value={field.value ?? undefined}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger
                          id="edit-user-branch"
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
              {isPending ? 'Menyimpan…' : 'Simpan Perubahan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
