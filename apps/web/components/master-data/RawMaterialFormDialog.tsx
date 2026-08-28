'use client';

import * as React from 'react';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateRawMaterialSchema,
  type CreateRawMaterial,
  type RawMaterialResponse,
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
import { CurrencyInput } from '@ohmypos/ui/components/currency-input';
import { Label } from '@ohmypos/ui/components/label';
import {
  useCreateRawMaterial,
  useUpdateRawMaterial,
} from '@/hooks/useMasterData';

interface RawMaterialFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  material?: RawMaterialResponse | null;
}

export function RawMaterialFormDialog({
  open,
  onOpenChange,
  material,
}: RawMaterialFormDialogProps) {
  const isEdit = Boolean(material);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const createMutation = useCreateRawMaterial();
  const updateMutation = useUpdateRawMaterial();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(CreateRawMaterialSchema),
    defaultValues: {
      name: '',
      unit: '',
      purchaseUnit: '',
      conversionFactor: '1',
      unitCost: '',
      lowStockThreshold: '0',
    },
  });

  const watchedUnit = useWatch({ control, name: 'unit' });
  const watchedPurchaseUnit = useWatch({ control, name: 'purchaseUnit' });
  const watchedFactor = useWatch({ control, name: 'conversionFactor' });

  // ADR-024: the stock unit is immutable once the material has movement
  // history. The server rejects the change with a 400; disabling the field is
  // what stops the user from typing a change they cannot save.
  const isBaseUnitLocked = Boolean(material?.isBaseUnitLocked);

  React.useEffect(() => {
    if (open) {
      if (material) {
        reset({
          name: material.name,
          unit: material.unit,
          purchaseUnit: material.purchaseUnit,
          conversionFactor: String(material.conversionFactor),
          unitCost: String(material.unitCost),
          lowStockThreshold: String(material.lowStockThreshold),
        });
      } else {
        reset({
          name: '',
          unit: '',
          purchaseUnit: '',
          conversionFactor: '1',
          unitCost: '',
          lowStockThreshold: '0',
        });
      }
    }
  }, [open, material, reset]);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setServerError(null);
    }
    onOpenChange(newOpen);
  };

  const onSubmit = async (values: CreateRawMaterial) => {
    setServerError(null);
    try {
      if (isEdit && material) {
        await updateMutation.mutateAsync({
          id: material.id,
          data: values,
        });
      } else {
        await createMutation.mutateAsync(values);
      }
      onOpenChange(false);
    } catch (error) {
      setServerError(
        error instanceof Error
          ? error.message
          : 'Terjadi kesalahan saat menyimpan bahan baku.',
      );
    }
  };

  const isPending =
    isSubmitting || createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-120">
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>
              {isEdit ? 'Edit Bahan Baku' : 'Tambah Bahan Baku'}
            </DialogTitle>
            <DialogDescription>
              Isi data bahan mentah atau bahan baku yang digunakan untuk resep
              menu.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="rm-name">Nama Bahan Baku</Label>
              <Input
                id="rm-name"
                placeholder="Contoh: Biji Kopi Espresso, Susu UHT"
                aria-invalid={Boolean(errors.name)}
                {...register('name')}
              />
              {errors.name && (
                <p role="alert" className="text-xs text-status-danger">
                  {errors.name.message}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rm-unit">Satuan Stok / Resep</Label>
                <Input
                  id="rm-unit"
                  placeholder="gram, ml, pcs"
                  disabled={isBaseUnitLocked}
                  title={
                    isBaseUnitLocked
                      ? 'Tidak bisa diubah — bahan ini sudah punya riwayat stok.'
                      : undefined
                  }
                  aria-invalid={Boolean(errors.unit)}
                  {...register('unit')}
                />
                <p className="text-xs text-text-tertiary">
                  {isBaseUnitLocked
                    ? 'Terkunci karena sudah ada riwayat stok. Ubah satuan beli di sebelah jika kemasan pemasok berubah.'
                    : 'Satuan terkecil untuk stok, resep, dan stok opname.'}
                </p>
                {errors.unit && (
                  <p role="alert" className="text-xs text-status-danger">
                    {errors.unit.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rm-purchase-unit">Satuan Beli</Label>
                <Input
                  id="rm-purchase-unit"
                  placeholder="kg, liter, ekor, pack"
                  aria-invalid={Boolean(errors.purchaseUnit)}
                  {...register('purchaseUnit')}
                />
                <p className="text-xs text-text-tertiary">
                  Satuan saat membeli dari pemasok.
                </p>
                {errors.purchaseUnit && (
                  <p role="alert" className="text-xs text-status-danger">
                    {errors.purchaseUnit.message}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rm-conversion">Isi per Satuan Beli</Label>
                <Input
                  id="rm-conversion"
                  type="text"
                  inputMode="decimal"
                  placeholder="1000"
                  className="numeric font-mono"
                  aria-invalid={Boolean(errors.conversionFactor)}
                  {...register('conversionFactor')}
                />
                <p
                  data-testid="rm-conversion-hint"
                  className="text-xs text-text-tertiary"
                >
                  {watchedPurchaseUnit && watchedUnit && watchedFactor
                    ? `1 ${watchedPurchaseUnit} = ${watchedFactor} ${watchedUnit}`
                    : 'Contoh: 1 kg = 1000 gram, 1 ekor = 10 pcs.'}
                </p>
                {errors.conversionFactor && (
                  <p role="alert" className="text-xs text-status-danger">
                    {errors.conversionFactor.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rm-cost">
                  Biaya per Satuan Stok (Rp)
                  {watchedUnit ? ` / ${watchedUnit}` : ''}
                </Label>
                <Controller
                  name="unitCost"
                  control={control}
                  render={({ field }) => (
                    <CurrencyInput
                      id="rm-cost"
                      placeholder="15.000"
                      aria-invalid={Boolean(errors.unitCost)}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                    />
                  )}
                />
                <p className="text-xs text-text-tertiary">
                  Diperbarui otomatis oleh pembelian terakhir.
                </p>
                {errors.unitCost && (
                  <p role="alert" className="text-xs text-status-danger">
                    {errors.unitCost.message}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rm-threshold">Batas Peringatan Stok Rendah</Label>
              <Input
                id="rm-threshold"
                type="text"
                inputMode="decimal"
                placeholder="0"
                className="numeric font-mono"
                aria-invalid={Boolean(errors.lowStockThreshold)}
                {...register('lowStockThreshold')}
              />
              <p className="text-xs text-text-tertiary">
                Dalam satuan stok
                {watchedUnit ? ` (${watchedUnit})` : ''}. Sistem akan
                menampilkan peringatan jika stok berada di bawah jumlah ini.
              </p>
              {errors.lowStockThreshold && (
                <p role="alert" className="text-xs text-status-danger">
                  {errors.lowStockThreshold.message}
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
                  : 'Tambah Bahan Baku'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
