'use client';

import * as React from 'react';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateLedgerEntrySchema,
  type CreateLedgerEntry,
  type LedgerEntryResponse,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ohmypos/ui/components/select';
import { DatePicker } from '@ohmypos/ui/components/date-picker';
import { CurrencyInput } from '@ohmypos/ui/components/currency-input';
import { Label } from '@ohmypos/ui/components/label';
import { RadioInput } from '@ohmypos/ui/components/radio-input';
import {
  useAccounts,
  useBranches,
  useCategories,
  useCreateLedgerEntry,
  useUpdateLedgerEntry,
} from '@/hooks/useExpenses';

interface GeneralExpenseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry?: LedgerEntryResponse | null;
}

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

export function GeneralExpenseFormDialog({
  open,
  onOpenChange,
  entry,
}: GeneralExpenseFormDialogProps) {
  const [serverError, setServerError] = React.useState<string | null>(null);
  const lastSelectedBranchId = React.useRef<string | null>(null);

  const { data: categories = [] } = useCategories();
  const { data: accounts = [] } = useAccounts();
  const { data: branches = [] } = useBranches();
  const createMutation = useCreateLedgerEntry();
  const updateMutation = useUpdateLedgerEntry();
  const isEdit = Boolean(entry);

  const centralBranch = React.useMemo(
    () => branches.find((branch) => branch.name === 'Pusat (Dapur Sentral)'),
    [branches],
  );
  const selectableBranches = React.useMemo(
    () => branches.filter((branch) => branch.id !== centralBranch?.id),
    [branches, centralBranch?.id],
  );

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
    setValue,
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

  const selectedBranchId = useWatch({ control, name: 'branchId' });
  const isCentral = selectedBranchId === null;

  React.useEffect(() => {
    if (open) {
      lastSelectedBranchId.current = entry?.branchId ?? null;
      reset(
        entry
          ? {
              accountId: entry.accountId,
              categoryId: entry.categoryId,
              branchId: entry.branchId,
              entryDate: new Date(entry.entryDate).toISOString().slice(0, 10),
              amount: entry.amount,
              type: 'OUTFLOW' as const,
              note: entry.note ?? '',
            }
          : {
              accountId: '',
              categoryId: '',
              branchId: '',
              entryDate: todayIsoDate(),
              amount: '',
              type: 'OUTFLOW' as const,
              note: '',
            },
      );
    }
  }, [entry, open, reset]);

  React.useEffect(() => {
    if (open && entry && entry.branchId === centralBranch?.id) {
      setValue('branchId', null);
    }
  }, [centralBranch?.id, entry, open, setValue]);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) setServerError(null);
    onOpenChange(newOpen);
  };

  const onSubmit = async (values: CreateLedgerEntry) => {
    setServerError(null);
    try {
      if (entry) {
        await updateMutation.mutateAsync({ id: entry.id, data: values });
      } else {
        await createMutation.mutateAsync(values);
      }
      onOpenChange(false);
    } catch (error) {
      setServerError(
        error instanceof Error
          ? error.message
          : 'Terjadi kesalahan saat menyimpan pengeluaran.',
      );
    }
  };

  const isPending =
    isSubmitting || createMutation.isPending || updateMutation.isPending;

  const selectBranchMode = () => {
    const preservedBranchId = lastSelectedBranchId.current;
    const nextBranchId = selectableBranches.some(
      (branch) => branch.id === preservedBranchId,
    )
      ? preservedBranchId
      : (selectableBranches[0]?.id ?? '');

    lastSelectedBranchId.current = nextBranchId || null;
    setValue('branchId', nextBranchId, { shouldValidate: true });
  };

  const selectCentralMode = () => {
    if (
      selectedBranchId &&
      selectableBranches.some((branch) => branch.id === selectedBranchId)
    ) {
      lastSelectedBranchId.current = selectedBranchId;
    }
    setValue('branchId', null, { shouldValidate: true });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>
              {isEdit ? 'Edit Biaya Operasional' : 'Catat Biaya Operasional'}
            </DialogTitle>
            <DialogDescription>
              Masukkan pengeluaran operasional toko seperti utilitas, sewa, atau
              keperluan lainnya.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="expense-category">Kategori</Label>
                <Controller
                  name="categoryId"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger
                        id="expense-category"
                        aria-invalid={Boolean(errors.categoryId)}
                        className="h-9 text-sm"
                      >
                        <SelectValue placeholder="-- Pilih Kategori --" />
                      </SelectTrigger>
                      <SelectContent>
                        {expenseCategories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.categoryId && (
                  <p role="alert" className="text-xs text-status-danger">
                    {errors.categoryId.message}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="expense-account">Akun / Kas</Label>
                <Controller
                  name="accountId"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger
                        id="expense-account"
                        aria-invalid={Boolean(errors.accountId)}
                        className="h-9 text-sm"
                      >
                        <SelectValue placeholder="-- Pilih Akun --" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.accountId && (
                  <p role="alert" className="text-xs text-status-danger">
                    {errors.accountId.message}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Lokasi Pengeluaran</Label>
              <div className="flex h-9 items-center gap-4">
                <Label className="flex cursor-pointer items-center gap-1.5 text-sm font-normal">
                  <RadioInput
                    name="expense-location-mode"
                    checked={!isCentral}
                    onChange={selectBranchMode}
                  />
                  Cabang
                </Label>
                <Label className="flex cursor-pointer items-center gap-1.5 text-sm font-normal">
                  <RadioInput
                    name="expense-location-mode"
                    checked={isCentral}
                    onChange={selectCentralMode}
                  />
                  Pusat
                </Label>
              </div>
              {!isCentral && (
                <Controller
                  name="branchId"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value ?? ''}
                      onValueChange={(value) => {
                        lastSelectedBranchId.current = value;
                        field.onChange(value);
                      }}
                    >
                      <SelectTrigger
                        id="expense-branch"
                        aria-label="Pilih Cabang"
                        aria-invalid={Boolean(errors.branchId)}
                        className="h-9 text-sm"
                      >
                        <SelectValue placeholder="-- Pilih Cabang --" />
                      </SelectTrigger>
                      <SelectContent>
                        {selectableBranches.map((branch) => (
                          <SelectItem key={branch.id} value={branch.id}>
                            {branch.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
              {errors.branchId && (
                <p role="alert" className="text-xs text-status-danger">
                  {errors.branchId.message}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="expense-date">Tanggal</Label>
                <Controller
                  name="entryDate"
                  control={control}
                  render={({ field }) => (
                    <DatePicker
                      id="expense-date"
                      ariaLabel="Tanggal pengeluaran"
                      ariaInvalid={Boolean(errors.entryDate)}
                      value={field.value}
                      side="top"
                      onChange={field.onChange}
                    />
                  )}
                />
                {errors.entryDate && (
                  <p role="alert" className="text-xs text-status-danger">
                    {errors.entryDate.message}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
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

            <div className="flex flex-col gap-1.5">
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
              {isPending
                ? 'Menyimpan…'
                : isEdit
                  ? 'Simpan Perubahan'
                  : 'Simpan Pengeluaran'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
