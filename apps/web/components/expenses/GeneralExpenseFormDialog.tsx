'use client';

import * as React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateLedgerEntrySchema,
  type CreateLedgerEntry,
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
import { NativeSelect } from '@ohmypos/ui/components/native-select';
import { CurrencyInput } from '@ohmypos/ui/components/currency-input';
import { Label } from '@ohmypos/ui/components/label';
import {
  useAccounts,
  useBranches,
  useCategories,
  useCreateLedgerEntry,
} from '@/hooks/useExpenses';

interface GeneralExpenseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

export function GeneralExpenseFormDialog({
  open,
  onOpenChange,
}: GeneralExpenseFormDialogProps) {
  const [serverError, setServerError] = React.useState<string | null>(null);

  const { data: categories = [] } = useCategories();
  const { data: accounts = [] } = useAccounts();
  const { data: branches = [] } = useBranches();
  const createMutation = useCreateLedgerEntry();

  // Only expense (OUTFLOW) categories belong on this form — the ledger-entries
  // endpoint itself is generic, but this screen is "Pengeluaran" specifically.
  const expenseCategories = React.useMemo(
    () => categories.filter((c) => c.type === 'OUTFLOW'),
    [categories],
  );

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(CreateLedgerEntrySchema),
    defaultValues: {
      accountId: '',
      categoryId: '',
      branchId: '',
      entryDate: todayIsoDate(),
      amount: '',
      type: 'OUTFLOW' as const,
      note: '',
    },
  });

  React.useEffect(() => {
    if (open) {
      reset({
        accountId: '',
        categoryId: '',
        branchId: '',
        entryDate: todayIsoDate(),
        amount: '',
        type: 'OUTFLOW' as const,
        note: '',
      });
    }
  }, [open, reset]);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) setServerError(null);
    onOpenChange(newOpen);
  };

  const onSubmit = async (values: CreateLedgerEntry) => {
    setServerError(null);
    try {
      await createMutation.mutateAsync(values);
      onOpenChange(false);
    } catch (error) {
      setServerError(
        error instanceof Error
          ? error.message
          : 'Terjadi kesalahan saat menyimpan pengeluaran.',
      );
    }
  };

  const isPending = isSubmitting || createMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>Tambah Pengeluaran</DialogTitle>
            <DialogDescription>
              Catat pengeluaran operasional umum (sewa, listrik, dll) yang
              langsung mengurangi kas.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="expense-category">Kategori</Label>
              <NativeSelect
                id="expense-category"
                aria-invalid={Boolean(errors.categoryId)}
                {...register('categoryId')}
              >
                <option value="">-- Pilih Kategori --</option>
                {expenseCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
              {errors.categoryId && (
                <p role="alert" className="text-xs text-status-danger">
                  {errors.categoryId.message}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="expense-account">Akun / Kas</Label>
                <NativeSelect
                  id="expense-account"
                  aria-invalid={Boolean(errors.accountId)}
                  {...register('accountId')}
                >
                  <option value="">-- Pilih Akun --</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </NativeSelect>
                {errors.accountId && (
                  <p role="alert" className="text-xs text-status-danger">
                    {errors.accountId.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="expense-branch">Cabang</Label>
                <NativeSelect
                  id="expense-branch"
                  aria-invalid={Boolean(errors.branchId)}
                  {...register('branchId')}
                >
                  <option value="">-- Pilih Cabang --</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </NativeSelect>
                {errors.branchId && (
                  <p role="alert" className="text-xs text-status-danger">
                    {errors.branchId.message}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="expense-date">Tanggal</Label>
                <Input
                  id="expense-date"
                  type="date"
                  aria-invalid={Boolean(errors.entryDate)}
                  {...register('entryDate')}
                />
                {errors.entryDate && (
                  <p role="alert" className="text-xs text-status-danger">
                    {errors.entryDate.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="expense-amount">Jumlah (Rp)</Label>
                <Controller
                  name="amount"
                  control={control}
                  render={({ field }) => (
                    <CurrencyInput
                      id="expense-amount"
                      placeholder="500.000"
                      aria-invalid={Boolean(errors.amount)}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                    />
                  )}
                />
                {errors.amount && (
                  <p role="alert" className="text-xs text-status-danger">
                    {errors.amount.message}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="expense-note">Catatan (opsional)</Label>
              <Input
                id="expense-note"
                placeholder="Contoh: Sewa toko bulan Agustus"
                {...register('note')}
              />
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
              {isPending ? 'Menyimpan…' : 'Simpan Pengeluaran'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
