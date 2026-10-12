import { z } from 'zod';

/**
 * Decimal primitives. Money and quantities cross the API as strings, never
 * JSON numbers; see README for scales.
 */

// Accepts standard decimals ("10", "10.5") and Indonesian/European comma format ("10,5")
const DECIMAL_PATTERN = /^-?\d+(?:[.,]\d+)?$/;

const MAX_PRECISION = 18;

export interface DecimalStringOptions {
  /** Maximum number of digits after the decimal point. */
  scale: number;
  /** Reject values below zero. Defaults to true — amounts and quantities are non-negative. */
  nonNegative?: boolean;
}

/** A decimal-as-string schema enforcing the column's precision and scale. */
export function decimalString(options: DecimalStringOptions) {
  const { scale, nonNegative = true } = options;

  return z
    .string()
    .trim()
    .regex(DECIMAL_PATTERN, 'Masukkan angka yang valid')
    .transform((val) => val.replace(',', '.'))
    .refine(
      (value) => (value.split('.')[1]?.length ?? 0) <= scale,
      `must have at most ${scale} decimal place(s)`,
    )
    .refine(
      (value) =>
        value.replace('-', '').replace('.', '').length <= MAX_PRECISION,
      `must have at most ${MAX_PRECISION} digits in total`,
    )
    .refine(
      (value) => !nonNegative || !value.startsWith('-'),
      'Tidak boleh bernilai negatif',
    );
}

/** A monetary amount in IDR — `Decimal(18,2)`. */
export const MoneyString = decimalString({ scale: 2 });
export type MoneyString = z.infer<typeof MoneyString>;

/** A stock or recipe quantity — `Decimal(18,4)`. */
export const QuantityString = decimalString({ scale: 4 });
export type QuantityString = z.infer<typeof QuantityString>;

/** A per-unit cost (a rate), `Decimal(18,6)` (ADR-024). Not for ledger amounts. */
export const UnitCostString = decimalString({ scale: 6 });
export type UnitCostString = z.infer<typeof UnitCostString>;

/** Stock units per purchase unit, `Decimal(18,4)`, strictly positive (ADR-024). */
export const ConversionFactorString = decimalString({ scale: 4 }).refine(
  (v) => Number(v) > 0,
  'Harus lebih besar dari 0',
);
export type ConversionFactorString = z.infer<typeof ConversionFactorString>;

/** Waste allowance in percent, `Decimal(5,2)`, 0–100 (ADR-024). */
export const WastePercentString = decimalString({ scale: 2 }).refine(
  (v) => Number(v) >= 0 && Number(v) <= 100,
  'must be between 0 and 100',
);
export type WastePercentString = z.infer<typeof WastePercentString>;

/** Every primary key in the schema is a UUID (ERD §2, §3). */
export const UuidString = z.uuid();
export type UuidString = z.infer<typeof UuidString>;

/** An ISO-8601 date-time carried as a string, parsed into a `Date` server-side. */
export const DateTimeString = z.iso.datetime({ offset: true }).or(z.iso.date());
export type DateTimeString = z.infer<typeof DateTimeString>;

/** A computed stock difference that may be negative. Never a stored quantity. */
export const SignedQuantityString = decimalString({
  scale: 4,
  nonNegative: false,
});
export type SignedQuantityString = z.infer<typeof SignedQuantityString>;

/** A computed money figure that may be negative (profit, net cash flow). */
export const SignedMoneyString = decimalString({
  scale: 2,
  nonNegative: false,
});
export type SignedMoneyString = z.infer<typeof SignedMoneyString>;

/** Client-generated UUID that makes a money-writing request idempotent (TASK-082). */
export const IdempotencyKey = UuidString;
export type IdempotencyKey = z.infer<typeof IdempotencyKey>;
