'use client';

import * as React from 'react';
import { useFieldArray, useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ReplaceRecipeSchema,
  type ProductWithHppResponse,
  type RawMaterialResponse,
  type ReplaceRecipe,
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
import { Label } from '@ohmypos/ui/components/label';
import { Badge } from '@ohmypos/ui/components/badge';
import { Plus, Trash2, AlertCircle, ChefHat, Sparkles } from 'lucide-react';
import { useProductRecipe, useReplaceRecipe } from '@/hooks/useMasterData';
import { formatCurrency, formatMarginPercentage } from '@/lib/formatters';

interface RecipeEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductWithHppResponse | null;
  rawMaterials: RawMaterialResponse[];
}

export function RecipeEditorDialog({
  open,
  onOpenChange,
  product,
  rawMaterials,
}: RecipeEditorDialogProps) {
  const [serverError, setServerError] = React.useState<string | null>(null);

  const { data: recipeEnvelope, isLoading: isRecipeLoading } = useProductRecipe(
    product?.id ?? null,
  );
  const replaceRecipeMutation = useReplaceRecipe();

  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ReplaceRecipe>({
    resolver: zodResolver(ReplaceRecipeSchema),
    defaultValues: {
      items: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  });

  const watchedItems = watch('items');

  // Populate form when recipe envelope is fetched or dialog opens
  const envelopeProductId = recipeEnvelope?.recipe.productId;
  React.useEffect(() => {
    if (!open) return;
    if (recipeEnvelope) {
      reset({
        items: recipeEnvelope.recipe.items.map((item) => ({
          rawMaterialId: item.rawMaterialId,
          quantityUsed: String(item.quantityUsed),
        })),
      });
    } else if (!isRecipeLoading) {
      reset({ items: [] });
    }
  }, [open, envelopeProductId, recipeEnvelope, isRecipeLoading, reset]);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setServerError(null);
    }
    onOpenChange(newOpen);
  };

  // Raw material lookup map for instant unit and unit cost labels
  const rawMaterialMap = React.useMemo(() => {
    const map = new Map<string, RawMaterialResponse>();
    for (const rm of rawMaterials) {
      map.set(rm.id, rm);
    }
    return map;
  }, [rawMaterials]);

  const onSubmit = async (values: ReplaceRecipe) => {
    if (!product) return;
    setServerError(null);
    try {
      const sanitizedValues: ReplaceRecipe = {
        items: values.items.map((item) => ({
          rawMaterialId: item.rawMaterialId,
          quantityUsed: String(item.quantityUsed).trim().replace(',', '.'),
        })),
      };
      await replaceRecipeMutation.mutateAsync({
        productId: product.id,
        data: sanitizedValues,
      });
      onOpenChange(false);
    } catch (error) {
      setServerError(
        error instanceof Error
          ? error.message
          : 'Gagal memperbarui resep produk.',
      );
    }
  };

  const isPending = isSubmitting || replaceRecipeMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-155 max-h-[90vh] flex flex-col">
        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="flex flex-col flex-1 overflow-hidden"
        >
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-sm bg-brand-primary text-white">
                <ChefHat className="size-5 text-white" />
              </div>
              <div>
                <DialogTitle>Resep & Takaran Menu</DialogTitle>
                <DialogDescription>
                  Tentukan takaran bahan baku yang terpakai otomatis setiap
                  produk ini terjual.
                  <br />
                  Produk:{' '}
                  <span className="font-semibold text-text-primary">
                    {product?.name}
                  </span>{' '}
                  (Harga Jual:{' '}
                  <span className="font-mono text-text-primary">
                    {product ? formatCurrency(product.sellPrice) : '—'}
                  </span>
                  )
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Current Live HPP Snapshot Banner from Server */}
          {recipeEnvelope && (
            <div className="mt-3 grid grid-cols-3 gap-2 rounded-sm border border-border-default bg-surface-muted/60 p-2.5 text-xs">
              <div>
                <span className="block text-[11px] text-text-tertiary">
                  Live HPP Saat Ini
                </span>
                <span className="font-mono font-semibold text-text-primary">
                  {recipeEnvelope.recipe.hpp
                    ? formatCurrency(recipeEnvelope.recipe.hpp)
                    : '— (Belum Ada Resep)'}
                </span>
                {/* Subtotal → susut → HPP, so the per-line costs below visibly
                    add up to a number the user can check (ADR-024). Waste is
                    edited on the product form, not here: this dialog does a
                    full recipe replace, and a cost parameter must not ride
                    along with it. */}
                {recipeEnvelope.recipe.baseHpp &&
                  Number(recipeEnvelope.recipe.wastePercent) > 0 && (
                    <span
                      data-testid="recipe-waste-breakdown"
                      className="block text-[11px] text-text-tertiary font-mono"
                    >
                      Subtotal {formatCurrency(recipeEnvelope.recipe.baseHpp)} +
                      susut {recipeEnvelope.recipe.wastePercent}%
                    </span>
                  )}
              </div>
              <div>
                <span className="block text-[11px] text-text-tertiary">
                  Margin Keuntungan
                </span>
                <span className="font-mono font-semibold text-accent-inflow">
                  {formatMarginPercentage(
                    product?.sellPrice,
                    recipeEnvelope.recipe.hpp,
                  ) ?? '—'}
                </span>
              </div>
              <div>
                <span className="block text-[11px] text-text-tertiary">
                  Status Resep
                </span>
                {recipeEnvelope.recipe.hasRecipe ? (
                  <Badge variant="success" className="text-[10px] px-1.5 py-0">
                    Aktif ({recipeEnvelope.recipe.items.length} bahan)
                  </Badge>
                ) : (
                  <Badge variant="warning" className="text-[10px] px-1.5 py-0">
                    Kosong
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Dynamic Ingredient Rows */}
          <div className="my-4 flex-1 overflow-y-auto pr-1 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                Bahan Baku yang Digunakan
              </Label>
              <Button
                type="button"
                variant="outline"
                size="xs"
                data-testid="add-ingredient-btn"
                onClick={() => append({ rawMaterialId: '', quantityUsed: '' })}
                className="gap-1 text-xs"
              >
                <Plus className="size-3" />
                Tambah Bahan
              </Button>
            </div>

            {isRecipeLoading ? (
              <div className="py-8 text-center text-sm text-text-secondary">
                Memuat data resep…
              </div>
            ) : fields.length === 0 ? (
              <div className="rounded-sm border border-dashed border-border-default p-6 text-center">
                <p className="text-sm text-text-secondary">
                  Belum ada bahan baku yang ditambahkan ke resep ini.
                </p>
                <p className="mt-1 text-xs text-text-tertiary">
                  Klik &quot;Tambah Bahan&quot; di atas untuk menghubungkan
                  bahan baku dan takaran.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  data-testid="add-first-ingredient-btn"
                  onClick={() =>
                    append({ rawMaterialId: '', quantityUsed: '' })
                  }
                  className="mt-3 gap-1.5"
                >
                  <Plus className="size-3.5" />
                  Tambah Bahan Baku Pertama
                </Button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {fields.map((field, index) => {
                  const selectedRmId = watchedItems?.[index]?.rawMaterialId;
                  const selectedRm = selectedRmId
                    ? rawMaterialMap.get(selectedRmId)
                    : null;
                  const rowError = errors.items?.[index];

                  return (
                    <div
                      key={field.id}
                      data-testid={`recipe-row-${index}`}
                      className="rounded-sm border border-border-default bg-surface-raised p-3 shadow-1 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="grid grid-cols-12 gap-2 items-start">
                          {/* Raw Material Select */}
                          <div className="col-span-12 sm:col-span-8 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <Label
                                htmlFor={`items.${index}.rawMaterialId`}
                                className="text-[11px] font-medium text-text-secondary"
                              >
                                Bahan Baku #{index + 1}
                              </Label>
                            </div>
                            <Controller
                              control={control}
                              name={`items.${index}.rawMaterialId`}
                              render={({ field: selectField }) => (
                                <Select
                                  value={selectField.value}
                                  onValueChange={selectField.onChange}
                                >
                                  <SelectTrigger
                                    id={`items.${index}.rawMaterialId`}
                                    data-testid={`raw-material-select-${index}`}
                                    aria-invalid={Boolean(
                                      rowError?.rawMaterialId,
                                    )}
                                    className="h-9 text-sm"
                                  >
                                    <SelectValue placeholder="-- Pilih Bahan Baku --" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {rawMaterials.map((rm) => (
                                      <SelectItem key={rm.id} value={rm.id}>
                                        {rm.name} ({rm.unit}) —{' '}
                                        {formatCurrency(rm.unitCost)}/{rm.unit}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            />
                            {rowError?.rawMaterialId && (
                              <p
                                role="alert"
                                className="text-[11px] text-status-danger"
                              >
                                {rowError.rawMaterialId.message}
                              </p>
                            )}
                          </div>

                          {/* Quantity Input */}
                          <div className="col-span-12 sm:col-span-4 space-y-1">
                            <Label
                              htmlFor={`items.${index}.quantityUsed`}
                              className="text-[11px] font-medium text-text-secondary block"
                            >
                              Takaran per Porsi{' '}
                              {selectedRm ? `(${selectedRm.unit})` : ''}
                            </Label>
                            <div className="relative">
                              <Input
                                id={`items.${index}.quantityUsed`}
                                data-testid={`quantity-input-${index}`}
                                type="text"
                                inputMode="decimal"
                                placeholder={
                                  selectedRm?.unit === 'kg' ||
                                  selectedRm?.unit === 'liter'
                                    ? '0.025'
                                    : '1'
                                }
                                className="numeric font-mono h-9 pr-12 text-sm placeholder:text-text-primary/35"
                                aria-invalid={Boolean(rowError?.quantityUsed)}
                                {...register(`items.${index}.quantityUsed`)}
                              />
                              {selectedRm && (
                                <span className="absolute right-2.5 top-2 text-xs font-mono text-text-tertiary">
                                  {selectedRm.unit}
                                </span>
                              )}
                            </div>
                            {rowError?.quantityUsed && (
                              <p
                                role="alert"
                                className="text-[11px] text-status-danger"
                              >
                                {rowError.quantityUsed.message}
                              </p>
                            )}
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          data-testid={`remove-ingredient-btn-${index}`}
                          title="Hapus baris bahan"
                          onClick={() => remove(index)}
                          className="size-4 text-status-danger hover:bg-status-danger/10"
                        >
                          <Trash2 className="size-4" />
                          <span className="sr-only">Hapus baris</span>
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* General validation issue or server error */}
            {errors.items?.root && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-sm border border-status-danger/30 bg-status-danger/10 p-2.5 text-xs text-status-danger"
              >
                <AlertCircle className="size-4 shrink-0" />
                <span>{errors.items.root.message}</span>
              </div>
            )}

            {serverError && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-sm border border-status-danger/30 bg-status-danger/10 p-2.5 text-xs text-status-danger"
              >
                <AlertCircle className="size-4 shrink-0" />
                <span>{serverError}</span>
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-border-default pt-4 gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => onOpenChange(false)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={isPending || isRecipeLoading}>
              <Sparkles className="size-3.5 mr-1" />
              {isPending ? 'Menyimpan Resep…' : 'Simpan & Hitung HPP'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
