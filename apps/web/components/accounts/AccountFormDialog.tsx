'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import {
  CreateAccountSchema,
  type CreateAccount,
  type AccountResponse,
  AccountType,
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
import { useCreateAccount, useUpdateAccount } from '@/hooks/useAccounts';

interface AccountFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account?: AccountResponse | null;
}

export function AccountFormDialog({
  open,
  onOpenChange,
  account,
}: AccountFormDialogProps) {
  const isEdit = Boolean(account);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const createMutation = useCreateAccount();
  const updateMutation = useUpdateAccount();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof CreateAccountSchema>, unknown, CreateAccount>({
    resolver: zodResolver(CreateAccountSchema),
    defaultValues: {
      name: '',
      type: 'CASH',
      openingBalance: '0',
    },
  });

  const selectedType = watch('type');

  React.useEffect(() => {
    if (open) {
      if (account) {
        reset({
          name: account.name,
          type: account.type,
          openingBalance: account.openingBalance,
        });
      } else {
        reset({
          name: '',
          type: 'CASH',
          openingBalance: '0',
        });
      }
    }
  }, [open, account, reset]);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setServerError(null);
    }
    onOpenChange(newOpen);
  };

  const onSubmit = async (values: CreateAccount) => {
    setServerError(null);
    try {
      if (isEdit && account) {
        await updateMutation.mutateAsync({ id: account.id, data: values });
      } else {
        await createMutation.mutateAsync(values);
      }
      onOpenChange(false);
    } catch (error) {
      setServerError(
        error instanceof Error
          ? error.message
          : 'Terjadi kesalahan saat menyimpan akun / metode pembayaran.',
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
              {isEdit ? 'Edit Metode Pembayaran' : 'Tambah Metode Pembayaran'}
            </DialogTitle>
            <DialogDescription>
              Tambah rekening bank atau kas tunai untuk mencatat aliran uang
              masuk dan keluar.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="account-name">Nama Akun / Metode</Label>
              <Input
                id="account-name"
                placeholder="Contoh: QRIS, Kas Tunai, Bank Mandiri"
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
              <Label htmlFor="account-type">Tipe Akun</Label>
              <Select
                value={selectedType}
                onValueChange={(val) =>
                  setValue('type', val as AccountType, {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger id="account-type" className="w-full">
                  <SelectValue placeholder="Pilih tipe akun" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Kas Tunai (CASH)</SelectItem>
                  <SelectItem value="EWALLET">
                    E-Wallet / QRIS (EWALLET)
                  </SelectItem>
                  <SelectItem value="BANK">Transfer Bank (BANK)</SelectItem>
                </SelectContent>
              </Select>
              {errors.type && (
                <p role="alert" className="text-xs text-status-danger">
                  {errors.type.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="account-openingBalance">Kas Awal (Rp)</Label>
              <Input
                id="account-openingBalance"
                placeholder="0"
                aria-invalid={Boolean(errors.openingBalance)}
                {...register('openingBalance')}
              />
              {errors.openingBalance && (
                <p role="alert" className="text-xs text-status-danger">
                  {errors.openingBalance.message}
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
                  : 'Tambah Metode'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
