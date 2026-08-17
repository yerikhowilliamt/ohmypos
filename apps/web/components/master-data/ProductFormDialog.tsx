'use client';

import * as React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateProductSchema,
  type CreateProduct,
  type ProductWithHppResponse,
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
import { Checkbox } from '@ohmypos/ui/components/checkbox';
import { useCreateProduct, useUpdateProduct } from '@/hooks/useMasterData';
import { formatCurrency, formatMarginPercentage } from '@/lib/formatters';

interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: ProductWithHppResponse | null;
}

export function ProductFormDialog({
  open,
  onOpenChange,
  product,
}: ProductFormDialogProps) {
  const isEdit = Boolean(product);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const createMutation = useCreateProduct();
  const updateMutation = useUpdateProduct();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(CreateProductSchema),
    defaultValues: {
      name: '',
      sellPrice: '',
      isActive: true,
    },
  });

  React.useEffect(() => {
    if (open) {
      if (product) {
        reset({
          name: product.name,
          sellPrice: String(product.sellPrice),
          isActive: product.isActive,
        });
      } else {
        reset({
          name: '',
          sellPrice: '',
          isActive: true,
        });
      }
    }
  }, [open, product, reset]);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setServerError(null);
    }
    onOpenChange(newOpen);
  };

  const onSubmit = async (values: CreateProduct) => {
    setServerError(null);
    try {
      if (isEdit && product) {
        await updateMutation.mutateAsync({
          id: product.id,
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
          : 'Terjadi kesalahan saat menyimpan produk.',
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
              {isEdit ? 'Edit Produk' : 'Tambah Produk Baru'}
            </DialogTitle>
            <DialogDescription>
              {isEdit
                ? 'Perbarui nama, harga jual, atau status aktif produk.'
                : 'Daftarkan menu atau produk baru untuk dijual di kasir/POS.'}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="product-name">Nama Produk / Menu</Label>
              <Input
                id="product-name"
                placeholder="Contoh: Kopi Susu Aren, Matcha Latte"
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
              <Label htmlFor="product-price">Harga Jual (Rp)</Label>
              <Controller
                name="sellPrice"
                control={control}
                render={({ field }) => (
                  <CurrencyInput
                    id="product-price"
                    placeholder="20.000"
                    aria-invalid={Boolean(errors.sellPrice)}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    ref={field.ref}
                  />
                )}
              />
              {errors.sellPrice && (
                <p role="alert" className="text-xs text-status-danger">
                  {errors.sellPrice.message}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Checkbox id="product-active" {...register('isActive')} />
              <Label
                htmlFor="product-active"
                className="cursor-pointer text-sm font-normal"
              >
                Produk Aktif (Dapat dijual di POS kasir)
              </Label>
            </div>

            {/* Live HPP Info for existing product */}
            {isEdit && product && (
              <div className="rounded-sm border border-border-default bg-surface-muted/50 p-3 text-xs space-y-1.5">
                <div className="font-medium text-text-primary flex justify-between">
                  <span>Informasi Resep & Biaya:</span>
                  <span className="font-mono text-text-secondary">
                    {product.hasRecipe ? 'Resep Terpasang' : 'Belum Ada Resep'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1 text-text-secondary">
                  <div>
                    <span className="block text-[11px] text-text-tertiary">
                      Live HPP
                    </span>
                    <span className="font-mono font-medium text-text-primary">
                      {product.hpp ? formatCurrency(product.hpp) : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-text-tertiary">
                      Margin
                    </span>
                    <span className="font-mono font-medium text-accent-inflow">
                      {formatMarginPercentage(product.sellPrice, product.hpp) ??
                        '—'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-text-tertiary">
                      Dapat Dibuat
                    </span>
                    <span className="font-mono font-medium text-text-primary">
                      {product.makeableQuantity !== null
                        ? `${product.makeableQuantity} porsi`
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>
            )}

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
                  : 'Tambah Produk'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
