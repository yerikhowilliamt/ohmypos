import { z } from 'zod';
import { AccountType } from './enums';
import { MoneyString, UuidString } from './primitives';

export const CreateAccountSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: AccountType,
  /** Kas Awal (PRD §5.1). Defaults to zero when the account starts empty. */
  openingBalance: MoneyString.default('0'),
});
export type CreateAccount = z.infer<typeof CreateAccountSchema>;

export const UpdateAccountSchema = CreateAccountSchema.partial();
export type UpdateAccount = z.infer<typeof UpdateAccountSchema>;

export const AccountResponseSchema = z.object({
  id: UuidString,
  name: z.string(),
  type: AccountType,
  openingBalance: MoneyString,
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
});
export type AccountResponse = z.infer<typeof AccountResponseSchema>;

/**
 * POS payment-method projection (PRD §5.2 — "each sale is tied to a payment
 * method"). Deliberately omits `openingBalance` (Kas Awal): a KASIR needs to
 * name the account a sale was paid into, and nothing more (ADR-011).
 */
export const PaymentMethodResponseSchema = z.object({
  id: UuidString,
  name: z.string(),
  type: AccountType,
});
export type PaymentMethodResponse = z.infer<typeof PaymentMethodResponseSchema>;
