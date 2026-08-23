'use client';

import * as React from 'react';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreatePayableSettlementSchema,
  type CreatePayableSettlement,
  type PayableResponse,
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
import { AlertCircle } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import {
  formatFixed,
  isNegative,
  parseFixed,
  subFixed,
  MONEY_SCALE,
} from '@/lib/decimal';
import { useAccounts, useSettlePayable } from '@/hooks/useExpenses';

interface PayableSettlementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payable: PayableResponse | null;
}

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

const isValidMoneyString = (value: string) => /^\d+(\.\d+)?$/.test(value);

export function PayableSettlementDialog({
  open,
  onOpenChange,
  payable,
}: PayableSettlementDialogProps) {
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [settlementIdempotencyKey, setSettlementIdempotencyKey] =
    React.useState(() => crypto.randomUUID());
  const { data: accounts = [] } = useAccounts();
  const settleMutation = useSettlePayable();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreatePayableSettlement>({
    resolver: zodResolver(CreatePayableSettlementSchema),
    defaultValues: {
      accountId: '',
      amount: '',
      settledAt: todayIsoDate(),
      note: '',
    },
  });

  React.useEffect(() => {
    if (open) {
      reset({
        accountId: '',
        amount: '',
        settledAt: todayIsoDate(),
        note: '',
      });
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSettlementIdempotencyKey(crypto.randomUUID());
    }
  }, [open, payable, reset]);

  const watchedAmount = useWatch({ control, name: 'amount' });

  /**
   * UX-only guard: warns and disables submit when the entered amount would
   * exceed `remainingBalance`, computed with the same `lib/decimal.ts` fixed-
   * point helpers used everywhere else in this codebase for money — never
   * `Number()` arithmetic. This is NOT the source of truth: the backend's
   * `SettlementExceedsPayableException` is what actually enforces the cap
   * (`assertSettlable`, `payables.service.ts`), and its error still surfaces
   * through `serverError` below if this client check is ever bypassed or
   * stale (e.g. two settlements racing against the same payable).
   */
  const overage = React.useMemo(() => {
    if (!payable || !watchedAmount || !isValidMoneyString(watchedAmount)) {
      return null;
    }
    const remaining = parseFixed(payable.remainingBalance, MONEY_SCALE);
    const amount = parseFixed(watchedAmount, MONEY_SCALE);
    const afterPayment = subFixed(remaining, amount);
    return {
      exceedsRemaining: isNegative(afterPayment),
      remainingAfter: isNegative(afterPayment)
        ? '0'
        : formatFixed(afterPayment, MONEY_SCALE),
    };
  }, [payable, watchedAmount]);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) setServerError(null);
    onOpenChange(newOpen);
  };

  const onSubmit = async (values: CreatePayableSettlement) => {
    if (!payable) return;
    setServerError(null);
    try {
      await settleMutation.mutateAsync({
        payableId: payable.id,
        data: {
          ...values,
          idempotencyKey: settlementIdempotencyKey,
        },
      });
      setSettlementIdempotencyKey(crypto.randomUUID());
      onOpenChange(false);
    } catch (error) {
      setServerError(
        error instanceof Error
          ? error.message
          : 'Terjadi kesalahan saat mencatat pelunasan.',
      );
    }
  };

  const isPending = isSubmitting || settleMutation.isPending;
  const blockedByOverage = Boolean(overage?.exceedsRemaining);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>Catat Pembayaran Utang</DialogTitle>
            <DialogDescription>
              Catat pelunasan atau cicilan pembayaran tagihan ke pemasok.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-2 rounded-sm border border-border-default bg-surface-muted/60 p-2.5 text-xs">
              <div>
                <span className="block text-[11px] text-text-tertiary">
                  Sisa Utang Saat Ini
                </span>
                <span className="font-mono font-semibold text-status-danger">
                  {payable ? formatCurrency(payable.remainingBalance) : '—'}
                </span>
              </div>
              <div>
                <span className="block text-[11px] text-text-tertiary">
                  Sisa Setelah Bayar
                </span>
                <span
                  data-testid="remaining-after-payment"
                  className={`font-mono font-semibold ${blockedByOverage ? 'text-status-danger' : 'text-text-primary'}`}
                >
                  {overage ? formatCurrency(overage.remainingAfter) : '—'}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="settlement-account">Dibayar Dari Akun</Label>
              <Controller
                name="accountId"
                control={control}
                render={({ field: accountField }) => (
                  <Select
                    value={accountField.value}
                    onValueChange={accountField.onChange}
                  >
                    <SelectTrigger
                      id="settlement-account"
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="settlement-amount">Jumlah Bayar (Rp)</Label>
                <Controller
                  name="amount"
                  control={control}
                  render={({ field }) => (
                    <CurrencyInput
                      id="settlement-amount"
                      data-testid="settlement-amount-input"
                      aria-invalid={Boolean(errors.amount) || blockedByOverage}
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

              <div className="space-y-1.5">
                <Label htmlFor="settlement-date">Tanggal Bayar</Label>
                <Controller
                  name="settledAt"
                  control={control}
                  render={({ field }) => (
                    <DatePicker
                      id="settlement-date"
                      ariaLabel="Tanggal bayar utang"
                      ariaInvalid={Boolean(errors.settledAt)}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
              </div>
            </div>

            {blockedByOverage && (
              <div
                role="alert"
                data-testid="overage-warning"
                className="flex items-center gap-2 rounded-sm border border-status-danger/30 bg-status-danger/10 p-2.5 text-xs text-status-danger"
              >
                <AlertCircle className="size-4 shrink-0" />
                <span>
                  Jumlah bayar melebihi sisa utang (
                  {payable ? formatCurrency(payable.remainingBalance) : '—'}).
                </span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="settlement-note">Catatan (opsional)</Label>
              <Input
                id="settlement-note"
                placeholder="Contoh: Transfer BCA"
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
            <Button type="submit" disabled={isPending || blockedByOverage}>
              {isPending ? 'Menyimpan…' : 'Bayar Utang'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
