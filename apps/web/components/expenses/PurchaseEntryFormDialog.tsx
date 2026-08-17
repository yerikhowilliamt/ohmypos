'use client';

import * as React from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateSupplierPurchaseSchema,
  type CreateSupplierPurchase,
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
import { AlertCircle, Plus, Trash2 } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import {
  addFixed,
  formatFixed,
  mulFixed,
  parseFixed,
  roundHalfUp,
  zero,
  MONEY_SCALE,
  QUANTITY_SCALE,
} from '@/lib/decimal';
import { useRawMaterials } from '@/hooks/useMasterData';
import {
  useAccounts,
  useBranches,
  useCreateSupplierPurchase,
  useSuppliers,
} from '@/hooks/useExpenses';
import { SupplierQuickCreateDialog } from './SupplierQuickCreateDialog';

interface PurchaseEntryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired after a successful UNPAID purchase, so the tab can bridge to Payables. */
  onUnpaidPurchaseCreated?: (supplierName: string) => void;
}

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

const EMPTY_ITEM = { rawMaterialId: '', quantity: '', unitCost: '' };

const DEFAULT_VALUES: CreateSupplierPurchase = {
  supplierId: '',
  branchId: null,
  purchaseDate: todayIsoDate(),
  paymentStatus: 'UNPAID',
  accountId: undefined,
  note: '',
  items: [],
};

/**
 * Cosmetic running total only — the server computes `totalAmount` from the
 * items and a client-sent total would be a money-correctness hole (the
 * schema deliberately has no `totalAmount` field). Mirrors the same
 * round-per-line-then-sum rule `SupplierPurchaseItem.lineTotal` uses server
 * side, using the same `lib/decimal.ts` fixed-point helpers `lib/pos/cart-totals.ts`
 * uses for the identical problem on the Sale side — no new math, no new dependency.
 */
function computePurchaseTotal(
  items: { quantity?: string; unitCost?: string }[],
): string {
  const total = items.reduce((sum, item) => {
    if (!item.quantity || !item.unitCost) return sum;
    if (!/^\d+(\.\d+)?$/.test(item.quantity)) return sum;
    if (!/^\d+(\.\d+)?$/.test(item.unitCost)) return sum;
    const quantity = parseFixed(item.quantity, QUANTITY_SCALE);
    const unitCost = parseFixed(item.unitCost, MONEY_SCALE);
    const lineTotal = roundHalfUp(mulFixed(quantity, unitCost), MONEY_SCALE);
    return addFixed(sum, lineTotal);
  }, zero(MONEY_SCALE));
  return formatFixed(total, MONEY_SCALE);
}

export function PurchaseEntryFormDialog({
  open,
  onOpenChange,
  onUnpaidPurchaseCreated,
}: PurchaseEntryFormDialogProps) {
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [isSupplierCreateOpen, setIsSupplierCreateOpen] = React.useState(false);

  const { data: suppliersData } = useSuppliers();
  const suppliers = suppliersData?.data ?? [];
  const { data: branches = [] } = useBranches();
  const { data: accounts = [] } = useAccounts();
  const { data: rawMaterials = [] } = useRawMaterials();
  const createMutation = useCreateSupplierPurchase();

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateSupplierPurchase>({
    resolver: zodResolver(CreateSupplierPurchaseSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const watchedBranchId = useWatch({ control, name: 'branchId' });
  const watchedPaymentStatus = useWatch({ control, name: 'paymentStatus' });
  const watchedItems = useWatch({ control, name: 'items' });

  const isCentral = watchedBranchId === null;
  const isPaid = watchedPaymentStatus === 'PAID';

  React.useEffect(() => {
    if (open) {
      reset(DEFAULT_VALUES);
    }
  }, [open, reset]);

  // Clearing accountId when switching to UNPAID mirrors the schema's own
  // superRefine (accountId forbidden when UNPAID) — kept in sync so a stale
  // value never survives a toggle back to PAID → UNPAID → submit.
  React.useEffect(() => {
    if (!isPaid) setValue('accountId', undefined);
  }, [isPaid, setValue]);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) setServerError(null);
    onOpenChange(newOpen);
  };

  const runningTotal = computePurchaseTotal(watchedItems ?? []);

  const onSubmit = async (values: CreateSupplierPurchase) => {
    setServerError(null);
    try {
      const created = await createMutation.mutateAsync(values);
      if (created.paymentStatus === 'UNPAID') {
        onUnpaidPurchaseCreated?.(created.supplierName);
      }
      onOpenChange(false);
    } catch (error) {
      setServerError(
        error instanceof Error
          ? error.message
          : 'Terjadi kesalahan saat mencatat pembelian.',
      );
    }
  };

  const isPending = isSubmitting || createMutation.isPending;

  const handleSupplierCreated = (supplier: SupplierResponse) => {
    setValue('supplierId', supplier.id);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[680px] max-h-[90vh] flex flex-col">
          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            className="flex flex-col flex-1 overflow-hidden"
          >
            <DialogHeader>
              <DialogTitle>Catat Pembelian Bahan Baku</DialogTitle>
              <DialogDescription>
                Stok bertambah segera; entri pengeluaran hanya dibuat sekarang
                jika dibayar langsung (ADR-006).
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 flex-1 overflow-y-auto pr-1 space-y-4">
              {/* Supplier picker */}
              <div className="space-y-1.5 ">
                <Label htmlFor="purchase-supplier">Pemasok</Label>
                <div className="flex gap-2">
                  <Controller
                    name="supplierId"
                    control={control}
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger
                          id="purchase-supplier"
                          aria-invalid={Boolean(errors.supplierId)}
                          className="h-9 text-sm"
                        >
                          <SelectValue placeholder="-- Pilih Pemasok --" />
                        </SelectTrigger>
                        <SelectContent>
                          {suppliers.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="default"
                    className="shrink-0"
                    onClick={() => setIsSupplierCreateOpen(true)}
                  >
                    + Pemasok Baru
                  </Button>
                </div>
                {errors.supplierId && (
                  <p role="alert" className="text-xs text-status-danger">
                    {errors.supplierId.message}
                  </p>
                )}
              </div>

              {/* Central / Branch */}
              <div className="space-y-1.5">
                <Label>Lokasi Pembelian</Label>
                <div className="flex items-center gap-4">
                  <Label className="flex items-center gap-1.5 text-sm cursor-pointer font-normal">
                    <RadioInput
                      name="purchase-mode"
                      checked={isCentral}
                      onChange={() => setValue('branchId', null)}
                    />
                    Pusat (Central)
                  </Label>
                  <Label className="flex items-center gap-1.5 text-sm cursor-pointer font-normal">
                    <RadioInput
                      name="purchase-mode"
                      checked={!isCentral}
                      onChange={() =>
                        setValue('branchId', branches[0]?.id ?? '')
                      }
                    />
                    Cabang
                  </Label>
                </div>
                {!isCentral && (
                  <Controller
                    name="branchId"
                    control={control}
                    render={({ field }) => (
                      <Select
                        value={field.value ?? ''}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger
                          aria-label="Pilih Cabang"
                          aria-invalid={Boolean(errors.branchId)}
                          className="h-9 text-sm"
                        >
                          <SelectValue placeholder="-- Pilih Cabang --" />
                        </SelectTrigger>
                        <SelectContent>
                          {branches.map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.name}
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

              {/* Payment status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Status Pembayaran</Label>
                  <div className="flex items-center gap-4 h-9">
                    <Label className="flex items-center gap-1.5 text-sm cursor-pointer font-normal">
                      <RadioInput
                        value="UNPAID"
                        checked={watchedPaymentStatus === 'UNPAID'}
                        {...register('paymentStatus')}
                      />
                      Utang
                    </Label>
                    <Label className="flex items-center gap-1.5 text-sm cursor-pointer font-normal">
                      <RadioInput
                        value="PAID"
                        checked={watchedPaymentStatus === 'PAID'}
                        {...register('paymentStatus')}
                      />
                      Lunas
                    </Label>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="purchase-date">Tanggal Pembelian</Label>
                  <Controller
                    name="purchaseDate"
                    control={control}
                    render={({ field }) => (
                      <DatePicker
                        id="purchase-date"
                        ariaLabel="Tanggal pembelian"
                        ariaInvalid={Boolean(errors.purchaseDate)}
                        value={field.value}
                        onChange={field.onChange}
                      />
                    )}
                  />
                </div>
              </div>

              {isPaid && (
                <div className="space-y-1.5">
                  <Label htmlFor="purchase-account">Dibayar Dari Akun</Label>
                  <Controller
                    name="accountId"
                    control={control}
                    render={({ field }) => (
                      <Select
                        value={field.value ?? ''}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger
                          id="purchase-account"
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
              )}

              {/* Item lines */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                    Daftar Bahan Baku Dibeli
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => append(EMPTY_ITEM)}
                    className="gap-1 text-xs"
                  >
                    <Plus className="size-3" />
                    Tambah Bahan
                  </Button>
                </div>

                {fields.length === 0 ? (
                  <div className="rounded-sm border border-dashed border-border-default p-6 text-center">
                    <p className="text-sm text-text-secondary">
                      Belum ada bahan baku ditambahkan.
                    </p>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => append(EMPTY_ITEM)}
                      className="mt-3 gap-1.5"
                    >
                      <Plus className="size-3.5" />
                      Tambah Bahan Pertama
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {fields.map((field, index) => {
                      const rowError = errors.items?.[index];
                      return (
                        <div
                          key={field.id}
                          data-testid={`purchase-item-row-${index}`}
                          className="flex flex-col justify-center items-end w-full rounded-sm border border-border-default bg-surface-raised p-2 shadow-1"
                        >
                          <div className="grid grid-cols-12 gap-4 items-start">
                            <div className="col-span-12 sm:col-span-5 space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <Label
                                  htmlFor={`items.${index}.rawMaterialId`}
                                  className="text-[11px] font-medium text-text-secondary"
                                >
                                  Bahan Baku #{index + 1}
                                </Label>
                              </div>
                              <Controller
                                name={`items.${index}.rawMaterialId`}
                                control={control}
                                render={({ field: rmField }) => (
                                  <Select
                                    value={rmField.value}
                                    onValueChange={rmField.onChange}
                                  >
                                    <SelectTrigger
                                      id={`items.${index}.rawMaterialId`}
                                      data-testid={`purchase-raw-material-select-${index}`}
                                      aria-invalid={Boolean(
                                        rowError?.rawMaterialId,
                                      )}
                                      className="h-9 text-sm"
                                    >
                                      <SelectValue placeholder="-- Pilih --" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {rawMaterials.map((rm) => (
                                        <SelectItem key={rm.id} value={rm.id}>
                                          {rm.name} ({rm.unit})
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

                            <div className="col-span-5 sm:col-span-3 space-y-1">
                              <Label
                                htmlFor={`items.${index}.quantity`}
                                className="text-[11px] font-medium text-text-secondary block"
                              >
                                Kuantitas
                              </Label>
                              <Input
                                id={`items.${index}.quantity`}
                                data-testid={`purchase-quantity-input-${index}`}
                                type="text"
                                inputMode="decimal"
                                placeholder="10"
                                className="numeric font-mono h-9 text-sm"
                                aria-invalid={Boolean(rowError?.quantity)}
                                {...register(`items.${index}.quantity`)}
                              />
                              {rowError?.quantity && (
                                <p
                                  role="alert"
                                  className="text-[11px] text-status-danger"
                                >
                                  {rowError.quantity.message}
                                </p>
                              )}
                            </div>

                            <div className="col-span-5 sm:col-span-3 space-y-1">
                              <Label
                                htmlFor={`items.${index}.unitCost`}
                                className="text-[11px] font-medium text-text-secondary block"
                              >
                                Harga Satuan
                              </Label>
                              <Controller
                                name={`items.${index}.unitCost`}
                                control={control}
                                render={({ field }) => (
                                  <CurrencyInput
                                    id={`items.${index}.unitCost`}
                                    data-testid={`purchase-unit-cost-input-${index}`}
                                    aria-invalid={Boolean(rowError?.unitCost)}
                                    value={field.value}
                                    onChange={field.onChange}
                                    onBlur={field.onBlur}
                                    name={field.name}
                                    ref={field.ref}
                                  />
                                )}
                              />
                              {rowError?.unitCost && (
                                <p
                                  role="alert"
                                  className="text-[11px] text-status-danger"
                                >
                                  {rowError.unitCost.message}
                                </p>
                              )}
                            </div>

                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              title="Hapus baris"
                              onClick={() => remove(index)}
                              className="size-6 text-status-danger hover:bg-status-danger/10 col-span-1 sm:col-span-1 space-y-1 mt-5"
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

                {errors.items?.root && (
                  <div
                    role="alert"
                    className="flex items-center gap-2 rounded-sm border border-status-danger/30 bg-status-danger/10 p-2.5 text-xs text-status-danger"
                  >
                    <AlertCircle className="size-4 shrink-0" />
                    <span>{errors.items.root.message}</span>
                  </div>
                )}
              </div>

              {/* Running total — display only, server computes the real totalAmount */}
              <div className="flex items-center justify-between rounded-sm border border-border-default bg-surface-muted/60 p-3">
                <span className="text-xs font-medium text-text-secondary">
                  Estimasi Total
                </span>
                <span
                  data-testid="purchase-running-total"
                  className="numeric font-mono font-semibold text-text-primary"
                >
                  {formatCurrency(runningTotal)}
                </span>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="purchase-note">Catatan (opsional)</Label>
                <Input
                  id="purchase-note"
                  placeholder="Contoh: Nota #123"
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

            <DialogFooter className="border-t border-border-default pt-4 gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => onOpenChange(false)}
              >
                Batal
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Menyimpan…' : 'Simpan Pembelian'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <SupplierQuickCreateDialog
        open={isSupplierCreateOpen}
        onOpenChange={setIsSupplierCreateOpen}
        onCreated={handleSupplierCreated}
      />
    </>
  );
}
