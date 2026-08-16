'use client';

import * as React from 'react';
import { useForm, Controller } from 'react-hook-form';
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
      unitCost: '',
      lowStockThreshold: '0',
    },
  });

  React.useEffect(() => {
    if (open) {
      if (material) {
        reset({
          name: material.name,
          unit: material.unit,
          unitCost: String(material.unitCost),
          lowStockThreshold: String(material.lowStockThreshold),
        });
      } else {
        reset({
          name: '',
          unit: '',
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
      <DialogContent className="sm:max-w-[480px]">
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>
              {isEdit ? 'Edit Bahan Baku' : 'Tambah Bahan Baku'}
            </DialogTitle>
            <DialogDescription>
              {isEdit
                ? 'Perbarui informasi bahan baku atau biaya per unit.'
                : 'Daftarkan bahan baku baru yang digunakan dalam resep atau inventaris.'}
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
                <Label htmlFor="rm-unit">Satuan (Unit)</Label>
                <Input
                  id="rm-unit"
                  placeholder="kg, liter, gr, shot, pcs"
                  aria-invalid={Boolean(errors.unit)}
                  {...register('unit')}
                />
                {errors.unit && (
                  <p role="alert" className="text-xs text-status-danger">
                    {errors.unit.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rm-cost">Biaya per Satuan (Rp)</Label>
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
                Sistem akan menampilkan peringatan jika stok berada di bawah
                jumlah ini.
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
