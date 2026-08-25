'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateCategorySchema,
  type CategoryResponse,
  type CreateCategory,
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
import { useCreateCategory, useUpdateCategory } from '@/hooks/useExpenses';

interface ExpenseCategoryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: CategoryResponse | null;
}

export function ExpenseCategoryFormDialog({
  open,
  onOpenChange,
  category,
}: ExpenseCategoryFormDialogProps) {
  const [serverError, setServerError] = React.useState<string | null>(null);
  const createMutation = useCreateCategory();
  const updateMutation = useUpdateCategory();
  const isEdit = Boolean(category);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateCategory>({
    resolver: zodResolver(CreateCategorySchema),
    defaultValues: { name: '', type: 'OUTFLOW' },
  });

  React.useEffect(() => {
    if (!open) return;
    reset({ name: category?.name ?? '', type: 'OUTFLOW' });
  }, [category, open, reset]);

  const onSubmit = async (values: CreateCategory) => {
    setServerError(null);
    try {
      if (category) {
        await updateMutation.mutateAsync({
          id: category.id,
          data: { name: values.name },
        });
      } else {
        await createMutation.mutateAsync(values);
      }
      onOpenChange(false);
    } catch (error) {
      setServerError(
        error instanceof Error
          ? error.message
          : 'Kategori pengeluaran tidak dapat disimpan.',
      );
    }
  };

  const isPending =
    isSubmitting || createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>
              {isEdit
                ? 'Edit Kategori Pengeluaran'
                : 'Tambah Kategori Pengeluaran'}
            </DialogTitle>
            <DialogDescription>
              Kategori ini akan tersedia saat mencatat pengeluaran umum.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex flex-col gap-4">
            <input type="hidden" value="OUTFLOW" {...register('type')} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="expense-category-name">Nama kategori</Label>
              <Input
                id="expense-category-name"
                placeholder="Contoh: Listrik & Air"
                autoFocus
                aria-invalid={Boolean(errors.name)}
                {...register('name')}
              />
              {errors.name && (
                <p role="alert" className="text-xs text-status-danger">
                  {errors.name.message}
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
                  : 'Tambah Kategori'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
