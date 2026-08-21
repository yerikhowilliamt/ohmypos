'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateBranchSchema,
  type CreateBranch,
  type BranchResponse,
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
import { useCreateBranch, useUpdateBranch } from '@/hooks/useBranches';

interface BranchFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branch?: BranchResponse | null;
}

export function BranchFormDialog({
  open,
  onOpenChange,
  branch,
}: BranchFormDialogProps) {
  const isEdit = Boolean(branch);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const createMutation = useCreateBranch();
  const updateMutation = useUpdateBranch();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(CreateBranchSchema),
    defaultValues: { name: '', address: '' },
  });

  React.useEffect(() => {
    if (open) {
      if (branch) {
        reset({ name: branch.name, address: branch.address ?? '' });
      } else {
        reset({ name: '', address: '' });
      }
    }
  }, [open, branch, reset]);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setServerError(null);
    }
    onOpenChange(newOpen);
  };

  const onSubmit = async (values: CreateBranch) => {
    setServerError(null);
    try {
      if (isEdit && branch) {
        await updateMutation.mutateAsync({ id: branch.id, data: values });
      } else {
        await createMutation.mutateAsync(values);
      }
      onOpenChange(false);
    } catch (error) {
      setServerError(
        error instanceof Error
          ? error.message
          : 'Terjadi kesalahan saat menyimpan cabang.',
      );
    }
  };

  const isPending =
    isSubmitting || createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>
              {isEdit ? 'Edit Cabang' : 'Tambah Cabang'}
            </DialogTitle>
            <DialogDescription>
              {isEdit
                ? 'Perbarui nama atau alamat cabang.'
                : 'Daftarkan cabang baru untuk penjualan dan penugasan staf.'}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="branch-name">Nama Cabang</Label>
              <Input
                id="branch-name"
                placeholder="Contoh: Cabang Kelapa Gading"
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
              <Label htmlFor="branch-address">Alamat (opsional)</Label>
              <Input
                id="branch-address"
                placeholder="Contoh: Jl. Boulevard Raya No. 1"
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
              {isPending
                ? 'Menyimpan…'
                : isEdit
                  ? 'Simpan Perubahan'
                  : 'Tambah Cabang'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
