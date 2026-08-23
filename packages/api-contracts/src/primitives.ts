import { z } from 'zod';

/**
 * Shared primitive schemas.
 *
 * Money and quantity cross the API boundary as **strings**, never numbers —
 * a JSON number is an IEEE-754 double and cannot hold a rupiah amount or a
 * stock quantity without risking silent precision loss (Playbook §5). The
 * service layer parses these back into a `Decimal` before any arithmetic.
 *
 * Scales match the database columns fixed by ADR-012: money is `Decimal(18,2)`,
 * quantity is `Decimal(18,4)`.
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

/**
 * Builds a schema for a decimal carried as a string, enforcing the same
 * precision and scale the database column will enforce — so an over-precise
 * value is rejected at the edge rather than silently rounded on insert.
 */
export function decimalString(options: DecimalStringOptions) {
  const { scale, nonNegative = true } = options;

  return z
    .string()
    .trim()
    .regex(DECIMAL_PATTERN, 'must be a decimal number written as a string')
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
      'must not be negative',
    );
}

/** A monetary amount in IDR — `Decimal(18,2)`. */
export const MoneyString = decimalString({ scale: 2 });
export type MoneyString = z.infer<typeof MoneyString>;

/** A stock or recipe quantity — `Decimal(18,4)`. */
export const QuantityString = decimalString({ scale: 4 });
export type QuantityString = z.infer<typeof QuantityString>;

/** Every primary key in the schema is a UUID (ERD §2, §3). */
export const UuidString = z.uuid();
export type UuidString = z.infer<typeof UuidString>;

/** An ISO-8601 date-time carried as a string, parsed into a `Date` server-side. */
export const DateTimeString = z.iso.datetime({ offset: true }).or(z.iso.date());
export type DateTimeString = z.infer<typeof DateTimeString>;

/**
 * A stock quantity that may legitimately be negative — a carry-forward or a
 * closing balance is a computed difference, not an amount (Phase 6 plan §2.1).
 * Never used for a stored `quantity` column: those carry magnitude only, with
 * the sign living in `StockMovement.direction`.
 */
export const SignedQuantityString = decimalString({
  scale: 4,
  nonNegative: false,
});
export type SignedQuantityString = z.infer<typeof SignedQuantityString>;

/**
 * A monetary amount that may legitimately be negative — e.g. gross profit,
 * net profit, or net cash flow for a central branch with expenses and zero
 * revenue (ADR-014, ADR-017).
 */
export const SignedMoneyString = decimalString({
  scale: 2,
  nonNegative: false,
});
export type SignedMoneyString = z.infer<typeof SignedMoneyString>;

/**
 * Kunci idempotensi yang dibuat klien untuk endpoint pencipta uang (TASK-082).
 *
 * UUID, bukan string bebas: panjangnya pasti, tabrakan tak sengaja secara
 * praktis mustahil, dan `crypto.randomUUID()` tersedia di setiap browser yang
 * POS ini dukung. Opsional supaya klien lama tetap jalan — tanpa kunci,
 * perilakunya persis seperti sebelum TASK-082, termasuk risikonya.
 */
export const IdempotencyKey = UuidString;
export type IdempotencyKey = z.infer<typeof IdempotencyKey>;
