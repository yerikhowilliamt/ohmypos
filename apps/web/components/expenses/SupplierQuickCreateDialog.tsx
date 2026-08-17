'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateSupplierSchema,
  type CreateSupplier,
  type SupplierResponse,
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
import { useCreateSupplier } from '@/hooks/useExpenses';

interface SupplierQuickCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Hands the newly created supplier back so the caller can select it immediately. */
  onCreated: (supplier: SupplierResponse) => void;
}

/**
 * Minimum viable supplier entry for the Purchase Entry form's picker — name
 * and contact only, no edit/delete. Full Supplier CRUD (a Master Data
 * concern, not this screen's) is tracked as tech debt (see Tech_Debt_Log).
 */
export function SupplierQuickCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: SupplierQuickCreateDialogProps) {
  const [serverError, setServerError] = React.useState<string | null>(null);
  const createMutation = useCreateSupplier();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(CreateSupplierSchema),
    defaultValues: { name: '', contact: '' },
  });

  React.useEffect(() => {
    if (open) {
      reset({ name: '', contact: '' });
    }
  }, [open, reset]);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) setServerError(null);
    onOpenChange(newOpen);
  };

  const onSubmit = async (values: CreateSupplier) => {
    setServerError(null);
    try {
      const created = await createMutation.mutateAsync(values);
      onCreated(created);
      onOpenChange(false);
    } catch (error) {
      setServerError(
        error instanceof Error
          ? error.message
          : 'Terjadi kesalahan saat menyimpan pemasok.',
      );
    }
  };

  const isPending = isSubmitting || createMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>Pemasok Baru</DialogTitle>
            <DialogDescription>
              Daftarkan pemasok baru untuk digunakan pada pembelian ini.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="supplier-name">Nama Pemasok</Label>
              <Input
                id="supplier-name"
                placeholder="Contoh: CV Sumber Rasa"
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
              <Label htmlFor="supplier-contact">Kontak (opsional)</Label>
              <Input
                id="supplier-contact"
                placeholder="Nomor telepon / WhatsApp / nama kontak"
                {...register('contact')}
              />
              {errors.contact && (
                <p role="alert" className="text-xs text-status-danger">
                  {errors.contact.message}
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
              {isPending ? 'Menyimpan…' : 'Tambah Pemasok'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
