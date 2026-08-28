'use client';

import * as React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Image as ImageIcon, Upload } from 'lucide-react';
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
import {
  useCreateProduct,
  useUpdateProduct,
  useUploadProductPhoto,
} from '@/hooks/useMasterData';
import { formatCurrency, formatMarginPercentage } from '@/lib/formatters';
import Image from 'next/image';

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
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const createMutation = useCreateProduct();
  const updateMutation = useUpdateProduct();
  const uploadPhotoMutation = useUploadProductPhoto();

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
      wastePercent: '0',
      isActive: true,
    },
  });

  React.useEffect(() => {
    if (open) {
      if (product) {
        reset({
          name: product.name,
          sellPrice: String(product.sellPrice),
          wastePercent: String(product.wastePercent),
          isActive: product.isActive,
        });
      } else {
        reset({
          name: '',
          sellPrice: '',
          wastePercent: '0',
          isActive: true,
        });
      }
    }
  }, [open, product, reset]);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setServerError(null);
      setSelectedFile(null);
      setPhotoPreview(null);
    }
    onOpenChange(newOpen);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPhotoPreview(url);
  };

  const onSubmit = async (values: CreateProduct) => {
    setServerError(null);
    try {
      let targetProductId = product?.id;
      if (isEdit && product) {
        await updateMutation.mutateAsync({
          id: product.id,
          data: values,
        });
      } else {
        const created = await createMutation.mutateAsync(values);
        targetProductId = created.id;
      }

      if (selectedFile && targetProductId) {
        await uploadPhotoMutation.mutateAsync({
          id: targetProductId,
          file: selectedFile,
        });
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
    isSubmitting ||
    createMutation.isPending ||
    updateMutation.isPending ||
    uploadPhotoMutation.isPending;

  const currentPhoto = photoPreview ?? product?.photoUrl;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>
              {isEdit ? 'Edit Produk' : 'Tambah Produk Baru'}
            </DialogTitle>
            <DialogDescription>
              Isi rincian produk menu yang akan dijual di kasir.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            {/* Product Photo Upload Field */}
            <div className="space-y-1.5">
              <Label>Foto Produk</Label>
              <div className="flex items-center gap-4">
                <div className="relative size-20 shrink-0 overflow-hidden rounded-md border border-border-default bg-surface-muted flex items-center justify-center">
                  {currentPhoto ? (
                    <Image
                      src={currentPhoto}
                      alt="Preview"
                      className="size-full object-cover"
                      width={80}
                      height={80}
                    />
                  ) : (
                    <ImageIcon className="size-8 text-text-tertiary" />
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="default"
                    className="gap-1.5"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="size-3.5" />
                    {currentPhoto ? 'Ganti Foto' : 'Pilih Foto'}
                  </Button>
                  <p className="text-[11px] text-text-tertiary">
                    Format: JPG, PNG, WebP (Maks 5MB)
                  </p>
                </div>
              </div>
            </div>

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

            <div className="space-y-1.5">
              <Label htmlFor="product-waste">Waste / Susut (%)</Label>
              <Input
                id="product-waste"
                type="text"
                inputMode="decimal"
                placeholder="0"
                className="numeric font-mono"
                aria-invalid={Boolean(errors.wastePercent)}
                {...register('wastePercent')}
              />
              <p className="text-xs text-text-tertiary">
                Menambah HPP produk ini saja. Tidak menambah pemakaian stok —
                jumlah bahan yang dipotong saat penjualan tetap sesuai resep.
              </p>
              {errors.wastePercent && (
                <p role="alert" className="text-xs text-status-danger">
                  {errors.wastePercent.message}
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
                    {/* The uplift is shown, not folded in silently — the user
                        must be able to see what the waste setting cost. */}
                    {product.baseHpp && Number(product.wastePercent) > 0 && (
                      <span
                        data-testid="product-waste-breakdown"
                        className="block text-[11px] text-text-tertiary font-mono"
                      >
                        {formatCurrency(product.baseHpp)} +{' '}
                        {product.wastePercent}%
                      </span>
                    )}
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
