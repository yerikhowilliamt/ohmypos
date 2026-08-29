'use client';

import * as React from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateSupplierPurchaseSchema,
  type CreateSupplierPurchase,
  type RawMaterialResponse,
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
  divFixed,
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
import { ScopeHint } from '@/components/branches/ScopeHint';

interface PurchaseEntryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired after a successful UNPAID purchase, so the tab can bridge to Payables. */
  onUnpaidPurchaseCreated?: (supplierName: string) => void;
}

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

const EMPTY_ITEM = { rawMaterialId: '', purchaseQuantity: '', lineTotal: '' };

/** Scale of `UnitCostString` — Decimal(18,6) per ADR-024. */
const UNIT_COST_SCALE = 6;

const DECIMAL_INPUT = /^\d+(\.\d+)?$/;

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
 * items and a client-sent total would be a money-correctness hole (the schema
 * deliberately has no `totalAmount` field).
 *
 * Since ADR-024 the user enters the line TOTAL directly, so this no longer
 * multiplies anything: the estimate is simply the sum of what was typed, which
 * is exactly what the server will store.
 */
function computePurchaseTotal(items: { lineTotal?: string }[]): string {
  const total = items.reduce((sum, item) => {
    if (!item.lineTotal || !DECIMAL_INPUT.test(item.lineTotal)) return sum;
    return addFixed(sum, parseFixed(item.lineTotal, MONEY_SCALE));
  }, zero(MONEY_SCALE));
  return formatFixed(total, MONEY_SCALE);
}

interface LinePreview {
  /** e.g. "2 liter = 2.000 ml" */
  conversion: string;
  /** e.g. "Rp22,50/ml" — null while the numbers cannot be divided yet. */
  unitCost: string | null;
  /** e.g. "Stok +2.000 ml" */
  stockDelta: string;
}

/**
 * Mirrors the server's `normalizePurchaseLine` (ADR-024) purely to SHOW the
 * user what their nota converts to before they submit. The stored figures are
 * always the server's — this preview exists so "2 liter for Rp45.000" is
 * visibly "2.000 ml at Rp22,50/ml" at entry time, not a surprise afterwards.
 */
function computeLinePreview(
  material: RawMaterialResponse | undefined,
  purchaseQuantity: string | undefined,
  lineTotal: string | undefined,
): LinePreview | null {
  if (!material || !purchaseQuantity) return null;
  if (!DECIMAL_INPUT.test(purchaseQuantity)) return null;

  const quantity = parseFixed(purchaseQuantity, QUANTITY_SCALE);
  const factor = parseFixed(material.conversionFactor, QUANTITY_SCALE);
  const stockQuantity = roundHalfUp(mulFixed(quantity, factor), QUANTITY_SCALE);
  if (stockQuantity.units === 0n) return null;

  const stockAmount = formatQuantity(
    formatFixed(stockQuantity, QUANTITY_SCALE),
  );
  const conversion = `${formatQuantity(purchaseQuantity)} ${material.purchaseUnit} = ${stockAmount} ${material.unit}`;

  let unitCost: string | null = null;
  if (lineTotal && DECIMAL_INPUT.test(lineTotal)) {
    const derived = divFixed(
      parseFixed(lineTotal, MONEY_SCALE),
      stockQuantity,
      UNIT_COST_SCALE,
    );
    if (derived) {
      // Trailing zeros trimmed: Rp22,50/ml reads better than Rp22,500000/ml,
      // and the six stored decimals are the server's business, not the user's.
      unitCost = `${formatCurrency(formatFixed(derived, UNIT_COST_SCALE))}/${material.unit}`;
    }
  }

  return {
    conversion,
    unitCost,
    stockDelta: `Stok +${stockAmount} ${material.unit}`,
  };
}

/** Trims a fixed-scale decimal string down to what is worth reading. */
function formatQuantity(value: string): string {
  const trimmed = value.includes('.')
    ? value.replace(/0+$/, '').replace(/\.$/, '')
    : value;
  const [intPart, fracPart] = trimmed.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return fracPart ? `${grouped},${fracPart}` : grouped;
}

export function PurchaseEntryFormDialog({
  open,
  onOpenChange,
  onUnpaidPurchaseCreated,
}: PurchaseEntryFormDialogProps) {
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [isSupplierCreateOpen, setIsSupplierCreateOpen] = React.useState(false);
  const [purchaseIdempotencyKey, setPurchaseIdempotencyKey] = React.useState(
    () => crypto.randomUUID(),
  );

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
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPurchaseIdempotencyKey(crypto.randomUUID());
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
      const payload = {
        ...values,
        idempotencyKey: purchaseIdempotencyKey,
      };
      const created = await createMutation.mutateAsync(payload);
      if (created.paymentStatus === 'UNPAID') {
        onUnpaidPurchaseCreated?.(created.supplierName);
      }
      setPurchaseIdempotencyKey(crypto.randomUUID());
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
                Masukkan rincian nota pembelian dari pemasok: jumlah dalam
                satuan beli dan total harga yang dibayar. Konversi ke satuan
                stok dan biaya per satuan dihitung otomatis.
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
                    Umum
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
                <ScopeHint>
                  Pilih{' '}
                  <strong className="font-medium text-text-primary">
                    Umum
                  </strong>{' '}
                  bila pembelian ini untuk kebutuhan bersama dan tidak
                  dibebankan ke satu cabang.
                </ScopeHint>
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
                        side="bottom"
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
                      const row = watchedItems?.[index];
                      const material = rawMaterials.find(
                        (rm) => rm.id === row?.rawMaterialId,
                      );
                      const preview = computeLinePreview(
                        material,
                        row?.purchaseQuantity,
                        row?.lineTotal,
                      );
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
                                          {rm.name} (beli: {rm.purchaseUnit})
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
                                htmlFor={`items.${index}.purchaseQuantity`}
                                className="text-[11px] font-medium text-text-secondary block"
                              >
                                Jumlah Beli
                                {material && (
                                  <span className="ml-1 font-normal text-text-tertiary">
                                    ({material.purchaseUnit})
                                  </span>
                                )}
                              </Label>
                              <Input
                                id={`items.${index}.purchaseQuantity`}
                                data-testid={`purchase-quantity-input-${index}`}
                                type="text"
                                inputMode="decimal"
                                placeholder="2"
                                className="numeric font-mono h-9 text-sm"
                                aria-invalid={Boolean(
                                  rowError?.purchaseQuantity,
                                )}
                                {...register(`items.${index}.purchaseQuantity`)}
                              />
                              {rowError?.purchaseQuantity && (
                                <p
                                  role="alert"
                                  className="text-[11px] text-status-danger"
                                >
                                  {rowError.purchaseQuantity.message}
                                </p>
                              )}
                            </div>

                            <div className="col-span-5 sm:col-span-3 space-y-1">
                              <Label
                                htmlFor={`items.${index}.lineTotal`}
                                className="text-[11px] font-medium text-text-secondary block"
                              >
                                Total Harga
                              </Label>
                              <Controller
                                name={`items.${index}.lineTotal`}
                                control={control}
                                render={({ field }) => (
                                  <CurrencyInput
                                    id={`items.${index}.lineTotal`}
                                    data-testid={`purchase-line-total-input-${index}`}
                                    aria-invalid={Boolean(rowError?.lineTotal)}
                                    value={field.value}
                                    onChange={field.onChange}
                                    onBlur={field.onBlur}
                                    name={field.name}
                                    ref={field.ref}
                                  />
                                )}
                              />
                              {rowError?.lineTotal && (
                                <p
                                  role="alert"
                                  className="text-[11px] text-status-danger"
                                >
                                  {rowError.lineTotal.message}
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

                          {/* ADR-024 conversion preview — what the nota becomes
                              in stock units, shown before submit so the derived
                              cost is never a surprise afterwards. */}
                          {preview && (
                            <div
                              data-testid={`purchase-conversion-preview-${index}`}
                              className="mt-1.5 w-full rounded-sm bg-surface-muted/60 px-2 py-1.5 text-[11px] text-text-secondary"
                            >
                              <span className="numeric font-mono">
                                {preview.conversion}
                              </span>
                              {preview.unitCost && (
                                <>
                                  <span className="mx-1.5 text-text-tertiary">
                                    ·
                                  </span>
                                  <span className="numeric font-mono">
                                    {preview.unitCost}
                                  </span>
                                </>
                              )}
                              <span className="mx-1.5 text-text-tertiary">
                                ·
                              </span>
                              <span className="numeric font-mono text-status-success">
                                {preview.stockDelta}
                              </span>
                            </div>
                          )}
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
