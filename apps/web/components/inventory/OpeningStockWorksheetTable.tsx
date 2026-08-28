'use client';

import * as React from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  UpsertOpeningStockSchema,
  type OpeningStockWorksheetRow,
  type UpsertOpeningStock,
} from '@ohmypos/api-contracts';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ohmypos/ui/components/table';
import { Input } from '@ohmypos/ui/components/input';
import { Button } from '@ohmypos/ui/components/button';
import { Badge } from '@ohmypos/ui/components/badge';
import { CurrencyInput } from '@ohmypos/ui/components/currency-input';
import { formatQuantity, toQuantityInputValue } from '@/lib/formatters';
import { Lock, Save, AlertCircle, CheckCircle2 } from 'lucide-react';

interface OpeningStockWorksheetTableProps {
  periodMonth: string;
  rows: OpeningStockWorksheetRow[];
  onSubmit: (data: UpsertOpeningStock) => Promise<void>;
  isSubmitting?: boolean;
}

/**
 * What to suggest in the physical-count field. The ledger's carry-forward is
 * only a sensible suggestion when it is positive — a negative one means goods
 * left before anything arrived (see "Sisa Periode Lalu", which still shows it
 * verbatim), and a physical count can never be negative.
 */
function carryForwardPlaceholder(carryForward: string | undefined): string {
  const plain = toQuantityInputValue(carryForward);
  if (plain === '' || plain.startsWith('-')) return '0';
  return plain;
}

export function OpeningStockWorksheetTable({
  periodMonth,
  rows,
  onSubmit,
  isSubmitting = false,
}: OpeningStockWorksheetTableProps) {
  // Form setup mapping to UpsertOpeningStock schema
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UpsertOpeningStock>({
    resolver: zodResolver(UpsertOpeningStockSchema),
    defaultValues: {
      periodMonth,
      entries: [],
    },
  });

  const { fields } = useFieldArray({
    control,
    name: 'entries',
    keyName: '_id',
  });

  // Re-sync form default values whenever rows or period changes
  React.useEffect(() => {
    reset({
      periodMonth,
      entries: rows.map((row) => ({
        rawMaterialId: row.rawMaterialId,
        // toQuantityInputValue, NOT formatQuantity — this seeds an editable
        // field that is submitted verbatim, and formatQuantity would render
        // "5000.0000" as the id-ID "5.000", which the API reads back as five.
        quantity: toQuantityInputValue(row.declaredQuantity),
        unitPrice: row.requiresUnitPrice
          ? (row.declaredUnitPrice ?? row.currentUnitCost)
          : undefined,
      })),
    });
  }, [periodMonth, rows, reset]);

  // Create lookup for static row metadata (name, unit, carryForwardQuantity, requiresUnitPrice)
  const rowMetaById = React.useMemo(() => {
    const map = new Map<string, OpeningStockWorksheetRow>();
    rows.forEach((r) => map.set(r.rawMaterialId, r));
    return map;
  }, [rows]);

  const declaredCount = rows.filter((r) => r.declaredQuantity !== null).length;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Top summary & actions bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-surface-raised p-4 rounded-md border border-border-default shadow-1">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-sm">
          <div className="flex items-center gap-1.5">
            <span className="text-text-secondary">Pencatatan Stok Awal:</span>
            <span className="font-semibold text-text-primary font-mono">
              {rows.length}
            </span>
          </div>
          <span className="text-border-strong hidden sm:inline">•</span>
          <div className="flex items-center gap-1.5">
            <span className="text-text-secondary">
              Masukkan jumlah fisik bahan baku yang tersedia di awal periode:
            </span>
            <span className="font-semibold text-text-primary font-mono">
              {declaredCount} / {rows.length}
            </span>
            {declaredCount === rows.length && rows.length > 0 ? (
              <Badge
                variant="default"
                className="bg-status-success/15 text-status-success hover:bg-status-success/20 border-0"
              >
                <CheckCircle2 className="size-3 mr-1" /> Lengkap
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="text-status-warning border-status-warning/40"
              >
                Sebagian
              </Badge>
            )}
          </div>
        </div>

        <Button
          type="submit"
          disabled={isSubmitting || rows.length === 0}
          className="gap-2 shrink-0 w-full sm:w-auto"
        >
          <Save className="size-4" />
          {isSubmitting ? 'Menyimpan...' : 'Simpan Stok Awal'}
        </Button>
      </div>

      {errors.entries && (
        <div className="p-3 bg-status-danger/10 border border-status-danger/30 rounded-md text-status-danger text-sm flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          <span>
            Periksa kembali input jumlah dan harga satuan pada formulir.
          </span>
        </div>
      )}

      {/* Main Worksheet Table */}
      <div className="rounded-md border border-border-default bg-surface-raised overflow-hidden shadow-1">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-surface-muted/50 hover:bg-surface-muted/50">
                <TableHead className="font-semibold text-text-primary w-[30%] min-w-[180px]">
                  Bahan Baku
                </TableHead>
                <TableHead className="font-semibold text-text-primary w-[12%] min-w-[80px]">
                  Satuan Stok
                </TableHead>
                <TableHead className="font-semibold text-text-primary text-right w-[18%] min-w-[140px]">
                  Sisa Periode Lalu
                </TableHead>
                <TableHead className="font-semibold text-text-primary w-[20%] min-w-[150px]">
                  Stok Fisik Awal (satuan stok){' '}
                  <span className="text-status-danger">*</span>
                </TableHead>
                <TableHead className="font-semibold text-text-primary w-[20%] min-w-[160px]">
                  Harga Satuan
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-32 text-center text-text-tertiary"
                  >
                    Tidak ada data bahan baku ditemukan.
                  </TableCell>
                </TableRow>
              ) : (
                fields.map((field, index) => {
                  const meta = rowMetaById.get(field.rawMaterialId);
                  const isDeclared = meta?.declaredQuantity !== null;
                  const rowError = errors.entries?.[index];

                  return (
                    <TableRow
                      key={field._id}
                      className={
                        isDeclared ? 'bg-surface-raised' : 'bg-surface-base/30'
                      }
                    >
                      {/* 1. Bahan Baku */}
                      <TableCell className="font-medium text-text-primary">
                        <div>
                          <span>{meta?.name ?? field.rawMaterialId}</span>
                          {meta?.requiresUnitPrice && (
                            <div className="text-xs text-status-warning font-normal mt-0.5">
                              Belum ada pembelian periode ini
                            </div>
                          )}
                        </div>
                      </TableCell>

                      {/* 2. Satuan stok — ALWAYS what the count is entered in.
                          The conversion hint below is a reading aid only; the
                          form never accepts a purchase-unit value (ADR-024). */}
                      <TableCell className="text-text-secondary text-sm">
                        <div>
                          <span>{meta?.unit ?? '—'}</span>
                          {meta && meta.purchaseUnit !== meta.unit && (
                            <div
                              data-testid={`opname-conversion-${field.rawMaterialId}`}
                              className="text-[11px] text-text-tertiary font-mono mt-0.5"
                            >
                              1 {meta.purchaseUnit} ={' '}
                              {formatQuantity(meta.conversionFactor, meta.unit)}
                            </div>
                          )}
                        </div>
                      </TableCell>

                      {/* 3. Sisa Periode Lalu (Carry Forward) */}
                      <TableCell className="text-right font-mono text-sm text-text-secondary">
                        {formatQuantity(meta?.carryForwardQuantity, meta?.unit)}
                      </TableCell>

                      {/* 4. Stok Fisik Awal (Quantity Input) */}
                      <TableCell>
                        <Controller
                          control={control}
                          name={`entries.${index}.quantity`}
                          render={({ field: inputField }) => (
                            <div>
                              <Input
                                {...inputField}
                                type="text"
                                inputMode="decimal"
                                // A plain, typeable number: the operator may
                                // copy it into the field. A negative
                                // carry-forward is never a physical count, so
                                // it is not offered as one.
                                placeholder={carryForwardPlaceholder(
                                  meta?.carryForwardQuantity,
                                )}
                                className="font-mono text-sm h-9"
                                aria-label={`Stok fisik ${meta?.name}`}
                                aria-invalid={Boolean(rowError?.quantity)}
                              />
                              {rowError?.quantity && (
                                <p className="text-xs text-status-danger mt-1">
                                  {rowError.quantity.message ??
                                    'Format jumlah tidak valid'}
                                </p>
                              )}
                            </div>
                          )}
                        />
                      </TableCell>

                      {/* 5. Harga Satuan (Conditional Input or Locked Badge) */}
                      <TableCell>
                        {meta?.requiresUnitPrice ? (
                          <Controller
                            control={control}
                            name={`entries.${index}.unitPrice`}
                            render={({ field: priceField }) => (
                              <div>
                                <CurrencyInput
                                  value={priceField.value ?? ''}
                                  onChange={priceField.onChange}
                                  placeholder="Harga satuan"
                                  className="h-9 text-sm"
                                  aria-label={`Harga satuan ${meta?.name}`}
                                  aria-invalid={Boolean(rowError?.unitPrice)}
                                />
                                {rowError?.unitPrice && (
                                  <p className="text-xs text-status-danger mt-1">
                                    {rowError.unitPrice.message ??
                                      'Wajib diisi'}
                                  </p>
                                )}
                              </div>
                            )}
                          />
                        ) : (
                          <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
                            <Badge
                              variant="outline"
                              className="gap-1 font-normal bg-surface-muted text-text-secondary border-border-default py-0.5"
                            >
                              <Lock className="size-3 text-text-tertiary" />
                              Otomatis (Pembelian)
                            </Badge>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </form>
  );
}
